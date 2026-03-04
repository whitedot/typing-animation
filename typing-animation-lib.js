(function (global) {
    'use strict';

    const VERSION = '1.2.0';
    const DEFAULT_OPTIONS = Object.freeze({
        typedId: 'hero-typed',
        typedSecondId: 'hero-typed-second',
        typedTrackId: 'hero-typed-track',
        typedSecondTrackId: 'hero-typed-second-track',
        heroRevealSelector: '.hero-reveal',
        firstFallbackText: 'Hello, World!',
        secondFallbackText: '오랜만이에요, 그누7!',
        firstWidthPadding: 4,
        secondWidthPadding: 4,
        lockLineWidth: true,
        startDelay: 260,
        betweenDelay: 680,
        afterSecondDelay: 1000,
        revealBaseDelay: 90,
        revealStep: 160,
        imeBeatPattern: [0.88, 1.06, 0.82, 1.12, 0.94, 1.03],
        lines: null,
        autoStart: true,
        startTrigger: 'immediate',
        startTriggerTarget: null,
        startTriggerEvent: 'click',
        pauseWhenHidden: true,
        reducedMotionBehavior: 'instant',
        composeClassName: 'hero-compose-box',
        replay: null,
        a11y: null,
        interaction: null,
        pace: null,
        preStartCursorBlinkMs: 0,
        hooks: null,
        randomFn: null,
        debug: false
    });

    const STATUS = Object.freeze({
        IDLE: 'idle',
        RUNNING: 'running',
        PAUSED: 'paused',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled',
        DESTROYED: 'destroyed'
    });

    const STRATEGY = Object.freeze({
        PLAIN: 'plain',
        IME: 'ime-ko',
        INSTANT: 'instant'
    });

    function toNumber(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function toOptionalNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    function easeInOutSine(x) {
        return -(Math.cos(Math.PI * x) - 1) / 2;
    }

    function toLowerSafe(value, fallback) {
        if (value == null) return fallback;
        return String(value).toLowerCase();
    }

    function resolveElement(doc, ref, fallbackId) {
        if (ref && ref.nodeType === 1) return ref;
        if (typeof ref === 'string') {
            const selector = ref.trim();
            if (!selector) return null;
            if (selector.charAt(0) === '#') return doc.querySelector(selector);
            return doc.getElementById(selector) || doc.querySelector(selector);
        }
        if (fallbackId) return doc.getElementById(fallbackId);
        return null;
    }

    function setFixedWidth(doc, container, text, extraWidth) {
        if (!container || !container.parentNode) return;
        const measure = doc.createElement('span');
        measure.className = 'hero-typed';
        measure.style.position = 'absolute';
        measure.style.visibility = 'hidden';
        measure.style.pointerEvents = 'none';
        measure.textContent = text;
        container.parentNode.appendChild(measure);
        const measuredWidth = Math.ceil(measure.getBoundingClientRect().width + extraWidth);
        const parentWidth = container.parentNode.getBoundingClientRect
            ? Math.floor(container.parentNode.getBoundingClientRect().width)
            : measuredWidth;
        const clampedWidth = Math.min(measuredWidth, Math.max(0, parentWidth));

        container.style.maxWidth = '100%';
        container.style.width = clampedWidth + 'px';
        measure.remove();
    }

    function createEmitter(options) {
        const hooks = Object.assign({}, options.hooks || {});
        const hookNames = [
            'onInit',
            'onPlay',
            'onPause',
            'onResume',
            'onLineStart',
            'onLineStep',
            'onLineEnd',
            'onComplete',
            'onCancel',
            'onError',
            'onStateChange'
        ];

        hookNames.forEach(function (name) {
            if (typeof options[name] === 'function') hooks[name] = options[name];
        });

        return function emit(name, payload) {
            if (typeof hooks[name] !== 'function') return;
            try {
                hooks[name](payload);
            } catch (error) {
                // ignore hook errors
            }
        };
    }

    function logDebugWarning(options, code, message, details) {
        if (!options || !options.debug) return;
        if (!global.console || typeof global.console.warn !== 'function') return;
        if (details == null) {
            global.console.warn('[TypingAnimationLib][' + code + '] ' + message);
            return;
        }
        global.console.warn('[TypingAnimationLib][' + code + '] ' + message, details);
    }

    function notifyConfigError(options, code, message, details) {
        const hooks = options && options.hooks && typeof options.hooks === 'object' ? options.hooks : {};
        const onError = typeof options.onError === 'function'
            ? options.onError
            : (typeof hooks.onError === 'function' ? hooks.onError : null);
        const payload = {
            code: code,
            message: message,
            details: details || null
        };

        if (onError) {
            try {
                onError(payload);
            } catch (error) {
                // ignore hook errors
            }
        }

        logDebugWarning(options, code, message, details);
    }

    function createScheduler(timerHost) {
        let paused = false;
        let cancelled = false;
        let active = null;

        function startTimer() {
            if (!active || paused || cancelled) return;
            active.startedAt = Date.now();
            active.timerId = timerHost.setTimeout(function () {
                const done = active;
                active = null;
                if (done) done.resolve(true);
            }, active.remaining);
        }

        function sleep(ms) {
            if (cancelled) return Promise.resolve(false);
            const remaining = Math.max(0, Math.round(ms || 0));
            return new Promise(function (resolve) {
                active = {
                    remaining: remaining,
                    startedAt: 0,
                    timerId: null,
                    resolve: resolve
                };
                if (!paused) startTimer();
            });
        }

        function pause() {
            if (paused || cancelled) return;
            paused = true;
            if (!active || active.timerId == null) return;
            timerHost.clearTimeout(active.timerId);
            active.timerId = null;
            active.remaining = Math.max(0, active.remaining - (Date.now() - active.startedAt));
        }

        function resume() {
            if (!paused || cancelled) return;
            paused = false;
            if (active && active.timerId == null) startTimer();
        }

        function cancel() {
            cancelled = true;
            paused = false;
            if (!active) return;
            if (active.timerId != null) timerHost.clearTimeout(active.timerId);
            const target = active;
            active = null;
            target.resolve(false);
        }

        function reset() {
            cancelled = false;
            paused = false;
            if (!active) return;
            if (active.timerId != null) timerHost.clearTimeout(active.timerId);
            const target = active;
            active = null;
            target.resolve(false);
        }

        return {
            sleep: sleep,
            pause: pause,
            resume: resume,
            cancel: cancel,
            reset: reset,
            isPaused: function () { return paused; },
            isCancelled: function () { return cancelled; }
        };
    }

    function normalizeLines(doc, options, reportIssue) {
        if (Array.isArray(options.lines) && options.lines.length > 0) {
            const lines = [];
            for (let idx = 0; idx < options.lines.length; idx += 1) {
                const input = options.lines[idx] || {};
                const containerEl = resolveElement(
                    doc,
                    input.container || input.containerEl || input.el || input.selector,
                    input.containerId || input.id || null
                );
                if (!containerEl) {
                    if (typeof reportIssue === 'function') {
                        reportIssue('LINE_CONTAINER_NOT_FOUND', 'Line container element was not found.', {
                            lineIndex: idx,
                            container: input.container || input.containerEl || input.el || input.selector || null,
                            containerId: input.containerId || input.id || null
                        });
                    }
                    continue;
                }

                let trackEl = resolveElement(doc, input.track || input.trackEl, input.trackId || null);
                if (!trackEl && typeof input.trackSelector === 'string') {
                    trackEl = containerEl.querySelector(input.trackSelector);
                }
                if (!trackEl) {
                    if (typeof reportIssue === 'function') {
                        reportIssue('LINE_TRACK_NOT_FOUND', 'Line track element was not found.', {
                            lineIndex: idx,
                            track: input.track || input.trackEl || null,
                            trackId: input.trackId || null,
                            trackSelector: input.trackSelector || null
                        });
                    }
                    continue;
                }

                const dataText = containerEl.dataset.text || '';
                const fallbackByIndex = idx === 0 ? options.firstFallbackText : idx === 1 ? options.secondFallbackText : '';
                const text = input.text != null
                    ? String(input.text)
                    : (dataText || (input.fallbackText != null ? String(input.fallbackText) : fallbackByIndex));

                const activateTargetEl = resolveElement(
                    doc,
                    input.activateTarget || input.activateTargetEl,
                    input.activateTargetId || null
                ) || containerEl;

                lines.push({
                    lineId: String(input.lineId || idx),
                    containerEl: containerEl,
                    trackEl: trackEl,
                    text: text,
                    strategy: String(input.strategy || STRATEGY.PLAIN).toLowerCase(),
                    widthPadding: toNumber(input.widthPadding, idx === 0 ? options.firstWidthPadding : idx === 1 ? options.secondWidthPadding : 4),
                    doneClass: String(input.doneClass || 'is-done'),
                    activateClass: typeof input.activateClass === 'string' ? input.activateClass : '',
                    activateTargetEl: activateTargetEl,
                    lockWidth: typeof input.lockWidth === 'boolean' ? input.lockWidth : null,
                    delayBefore: toOptionalNumber(input.delayBefore),
                    delayAfter: toOptionalNumber(input.delayAfter)
                });
            }

            for (let i = 0; i < lines.length; i += 1) {
                if (lines[i].delayBefore == null) {
                    lines[i].delayBefore = i === 0 ? toNumber(options.startDelay, 260) : 0;
                }
                if (lines[i].delayAfter == null) {
                    lines[i].delayAfter = i < lines.length - 1
                        ? toNumber(options.betweenDelay, 680)
                        : toNumber(options.afterSecondDelay, 1000);
                }
            }

            return lines;
        }

        const typedEl = doc.getElementById(options.typedId);
        const typedSecondEl = doc.getElementById(options.typedSecondId);
        const typedTrack = doc.getElementById(options.typedTrackId);
        const typedSecondTrack = doc.getElementById(options.typedSecondTrackId);
        if (!typedEl || !typedTrack || !typedSecondEl || !typedSecondTrack) {
            if (typeof reportIssue === 'function') {
                reportIssue('LEGACY_TARGET_NOT_FOUND', 'Legacy target elements were not found.', {
                    typedId: options.typedId,
                    typedSecondId: options.typedSecondId,
                    typedTrackId: options.typedTrackId,
                    typedSecondTrackId: options.typedSecondTrackId
                });
            }
            return null;
        }

        const firstText = typedEl.dataset.text || options.firstFallbackText;
        const secondText = typedSecondEl.dataset.text || options.secondFallbackText;

        return [
            {
                lineId: 'legacy-0',
                containerEl: typedEl,
                trackEl: typedTrack,
                text: firstText,
                strategy: STRATEGY.PLAIN,
                widthPadding: toNumber(options.firstWidthPadding, 4),
                doneClass: 'is-done',
                activateClass: '',
                activateTargetEl: typedEl,
                lockWidth: null,
                delayBefore: toNumber(options.startDelay, 260),
                delayAfter: toNumber(options.betweenDelay, 680)
            },
            {
                lineId: 'legacy-1',
                containerEl: typedSecondEl,
                trackEl: typedSecondTrack,
                text: secondText,
                strategy: STRATEGY.IME,
                widthPadding: toNumber(options.secondWidthPadding, 4),
                doneClass: 'is-done',
                activateClass: 'is-active',
                activateTargetEl: typedSecondEl,
                lockWidth: null,
                delayBefore: 0,
                delayAfter: toNumber(options.afterSecondDelay, 1000)
            }
        ];
    }

    function normalizeReveal(doc, options) {
        const revealConfig = options.reveal && typeof options.reveal === 'object' ? options.reveal : {};
        if (options.reveal === false) {
            return {
                enabled: false,
                items: [],
                visibleClass: 'is-visible',
                baseDelay: toNumber(options.revealBaseDelay, 90),
                step: toNumber(options.revealStep, 160)
            };
        }

        const selector = String(revealConfig.selector || options.heroRevealSelector || '.hero-reveal');
        const visibleClass = String(revealConfig.visibleClass || 'is-visible');
        const orderDataKey = String(revealConfig.orderDataKey || 'heroOrder');
        const baseDelay = toNumber(revealConfig.baseDelay, toNumber(options.revealBaseDelay, 90));
        const step = toNumber(revealConfig.step, toNumber(options.revealStep, 160));

        const items = Array.from(doc.querySelectorAll(selector))
            .map(function (el, idx) {
                return {
                    el: el,
                    order: toNumber((el.dataset || {})[orderDataKey], idx)
                };
            })
            .sort(function (a, b) {
                return a.order - b.order;
            });

        return {
            enabled: true,
            items: items,
            visibleClass: visibleClass,
            baseDelay: baseDelay,
            step: step
        };
    }

    function createTypeDelayGetter(options) {
        const randomFn = typeof options.randomFn === 'function' ? options.randomFn : Math.random;
        const pace = options.pace && typeof options.pace === 'object' ? options.pace : {};

        const minDelay = toNumber(pace.minDelay, 34);
        const maxDelay = toNumber(pace.maxDelay, 220);
        const baseDefault = toNumber(pace.baseDefault, 48);
        const baseIme = toNumber(pace.baseIme, 52);
        const rangeDefault = toNumber(pace.rangeDefault, 22);
        const rangeIme = toNumber(pace.rangeIme, 28);
        const jitter = toNumber(pace.jitter, 16);
        const emptyPause = toNumber(pace.emptyPause, 18);
        const spaceMultiplier = toNumber(pace.spaceMultiplier, 0.62);
        const punctuationPause = toNumber(pace.punctuationPause, 120);
        const jamoDelta = toNumber(pace.jamoDelta, -8);
        const waveAmount = toNumber(pace.waveAmount, 6);

        return function getTypeDelay(char, progress, lane) {
            const p = clamp01(progress || 0);
            const eased = easeInOutSine(p);
            const edgeWeight = Math.abs(eased - 0.5) * 2;
            const laneBase = lane === 'ime' ? baseIme : baseDefault;
            const laneRange = lane === 'ime' ? rangeIme : rangeDefault;
            let delay = laneBase + edgeWeight * laneRange + Math.floor(randomFn() * jitter);

            if (!char) {
                delay += emptyPause;
            } else if (char === ' ') {
                delay *= spaceMultiplier;
            } else if (/[,.!?]/.test(char)) {
                delay += punctuationPause;
            } else if (/^[ㄱ-ㅎㅏ-ㅣ]$/.test(char)) {
                delay += jamoDelta;
            }

            delay += Math.sin(p * Math.PI * 4 + 0.8) * waveAmount;
            const clamped = Math.max(minDelay, Math.round(delay));
            return Math.min(maxDelay, clamped);
        };
    }

    const L_COMPAT = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
    const V_COMPAT = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
    const T_COMPAT = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
    const HANGUL_BASE = 0xac00;
    const HANGUL_LAST = 0xd7a3;
    const COMBINE_VOWEL = {
        'ㅗㅏ': 'ㅘ',
        'ㅗㅐ': 'ㅙ',
        'ㅗㅣ': 'ㅚ',
        'ㅜㅓ': 'ㅝ',
        'ㅜㅔ': 'ㅞ',
        'ㅜㅣ': 'ㅟ',
        'ㅡㅣ': 'ㅢ'
    };
    const SPLIT_VOWEL = {
        'ㅘ': ['ㅗ', 'ㅏ'],
        'ㅙ': ['ㅗ', 'ㅐ'],
        'ㅚ': ['ㅗ', 'ㅣ'],
        'ㅝ': ['ㅜ', 'ㅓ'],
        'ㅞ': ['ㅜ', 'ㅔ'],
        'ㅟ': ['ㅜ', 'ㅣ'],
        'ㅢ': ['ㅡ', 'ㅣ']
    };
    const COMBINE_FINAL = {
        'ㄱㅅ': 'ㄳ',
        'ㄴㅈ': 'ㄵ',
        'ㄴㅎ': 'ㄶ',
        'ㄹㄱ': 'ㄺ',
        'ㄹㅁ': 'ㄻ',
        'ㄹㅂ': 'ㄼ',
        'ㄹㅅ': 'ㄽ',
        'ㄹㅌ': 'ㄾ',
        'ㄹㅍ': 'ㄿ',
        'ㄹㅎ': 'ㅀ',
        'ㅂㅅ': 'ㅄ'
    };
    const SPLIT_FINAL = {
        'ㄳ': ['ㄱ', 'ㅅ'],
        'ㄵ': ['ㄴ', 'ㅈ'],
        'ㄶ': ['ㄴ', 'ㅎ'],
        'ㄺ': ['ㄹ', 'ㄱ'],
        'ㄻ': ['ㄹ', 'ㅁ'],
        'ㄼ': ['ㄹ', 'ㅂ'],
        'ㄽ': ['ㄹ', 'ㅅ'],
        'ㄾ': ['ㄹ', 'ㅌ'],
        'ㄿ': ['ㄹ', 'ㅍ'],
        'ㅀ': ['ㄹ', 'ㅎ'],
        'ㅄ': ['ㅂ', 'ㅅ']
    };
    const L_INDEX = Object.fromEntries(L_COMPAT.map(function (char, idx) { return [char, idx]; }));
    const V_INDEX = Object.fromEntries(V_COMPAT.map(function (char, idx) { return [char, idx]; }));
    const T_INDEX = Object.fromEntries(T_COMPAT.map(function (char, idx) { return [char, idx]; }));
    const CONSONANTS = new Set(Object.keys(L_INDEX).concat(['ㄳ', 'ㄵ', 'ㄶ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅄ']));
    const VOWELS = new Set(Object.keys(V_INDEX));

    function composeHangul(l, v, t) {
        if (!l) return '';
        if (!v) return l;

        const lIndex = L_INDEX[l];
        const vIndex = V_INDEX[v];
        const tIndex = T_INDEX[t || ''] || 0;

        if (lIndex == null || vIndex == null) return l + v + (t || '');
        return String.fromCharCode(HANGUL_BASE + lIndex * 588 + vIndex * 28 + tIndex);
    }

    function syllableToKeys(char) {
        const code = char.charCodeAt(0);
        if (code < HANGUL_BASE || code > HANGUL_LAST) return [char];

        const syllableIndex = code - HANGUL_BASE;
        const lIndex = Math.floor(syllableIndex / 588);
        const vIndex = Math.floor((syllableIndex % 588) / 28);
        const tIndex = syllableIndex % 28;
        const lChar = L_COMPAT[lIndex];
        const vChar = V_COMPAT[vIndex];
        const tChar = T_COMPAT[tIndex];
        const keys = [lChar].concat(SPLIT_VOWEL[vChar] || [vChar]);

        if (tChar) keys.push.apply(keys, SPLIT_FINAL[tChar] || [tChar]);
        return keys;
    }

    function buildImeFrames(text) {
        const frames = [];
        let committed = '';
        let l = '';
        let v = '';
        let t = '';

        function getComposing() {
            return composeHangul(l, v, t);
        }

        function getKeyType(jamo) {
            if (CONSONANTS.has(jamo)) return 'consonant';
            if (VOWELS.has(jamo)) return 'vowel';
            return 'other';
        }

        function pushFrame(jamo, prevCommitted, prevComposing) {
            const composing = getComposing();
            const committedAdvanced = committed.length > prevCommitted.length;
            let action = 'steady';

            if (committedAdvanced && composing) action = 'carry';
            else if (committedAdvanced && !composing) action = 'commit';
            else if (!committedAdvanced && composing && prevComposing && composing !== prevComposing) action = 'compose-shift';
            else if (composing && !prevComposing) action = 'compose-start';
            else if (!composing && prevComposing) action = 'compose-end';

            frames.push({
                committed: committed,
                composing: composing,
                key: jamo || '',
                keyType: getKeyType(jamo || ''),
                action: action
            });
        }

        function flushComposing() {
            const composing = getComposing();
            if (!composing) return;
            committed += composing;
            l = '';
            v = '';
            t = '';
        }

        function processJamo(jamo) {
            if (CONSONANTS.has(jamo)) {
                if (!l) {
                    l = jamo;
                    return;
                }
                if (!v) {
                    committed += l;
                    l = jamo;
                    return;
                }
                if (!t) {
                    t = jamo;
                    return;
                }

                const combinedFinal = COMBINE_FINAL[t + jamo];
                if (combinedFinal) {
                    t = combinedFinal;
                    return;
                }

                committed += composeHangul(l, v, t);
                l = jamo;
                v = '';
                t = '';
                return;
            }

            if (!VOWELS.has(jamo)) {
                flushComposing();
                committed += jamo;
                return;
            }

            if (!l) {
                committed += jamo;
                return;
            }
            if (!v) {
                v = jamo;
                return;
            }
            if (!t) {
                const combinedVowel = COMBINE_VOWEL[v + jamo];
                if (combinedVowel) {
                    v = combinedVowel;
                    return;
                }

                committed += composeHangul(l, v);
                l = 'ㅇ';
                v = jamo;
                t = '';
                return;
            }

            const splitFinal = SPLIT_FINAL[t];
            if (splitFinal) {
                committed += composeHangul(l, v, splitFinal[0]);
                l = splitFinal[1];
                v = jamo;
                t = '';
                return;
            }

            const movedInitial = t;
            committed += composeHangul(l, v);
            l = movedInitial;
            v = jamo;
            t = '';
        }

        for (const char of text) {
            const keys = syllableToKeys(char);
            for (const key of keys) {
                const prevCommitted = committed;
                const prevComposing = getComposing();
                processJamo(key);
                pushFrame(key, prevCommitted, prevComposing);
            }
        }

        flushComposing();
        frames.push({ committed: committed, composing: '', key: '', keyType: 'other', action: 'final' });
        return frames;
    }

    function createImeDelayGetter(options, getTypeDelay) {
        const pace = options.pace && typeof options.pace === 'object' ? options.pace : {};
        const imeVowelDelta = toNumber(pace.imeVowelDelta, -8);
        const imeConsonantDelta = toNumber(pace.imeConsonantDelta, 6);
        const imeCommitPause = toNumber(pace.imeCommitPause, 42);
        const imeCarryPause = toNumber(pace.imeCarryPause, 26);
        const imeComposeShiftPause = toNumber(pace.imeComposeShiftPause, 14);
        const imeComposeStartPause = toNumber(pace.imeComposeStartPause, 8);
        const imeComposeEndPause = toNumber(pace.imeComposeEndPause, 12);
        const imeWaveAmount = toNumber(pace.imeWaveAmount, 4);
        const imeMinDelay = toNumber(pace.imeMinDelay, 34);

        return function getImeDelay(frame, index, totalFrames) {
            const progress = index / totalFrames;
            const lastChar = (frame.composing || frame.committed || '').slice(-1);
            const beatPattern = Array.isArray(options.imeBeatPattern) && options.imeBeatPattern.length > 0
                ? options.imeBeatPattern
                : DEFAULT_OPTIONS.imeBeatPattern;

            let delay = getTypeDelay(lastChar, progress, 'ime');
            delay *= beatPattern[index % beatPattern.length];

            if (frame.keyType === 'vowel') delay += imeVowelDelta;
            if (frame.keyType === 'consonant') delay += imeConsonantDelta;
            if (frame.action === 'commit') delay += imeCommitPause;
            else if (frame.action === 'carry') delay += imeCarryPause;
            else if (frame.action === 'compose-shift') delay += imeComposeShiftPause;
            else if (frame.action === 'compose-start') delay += imeComposeStartPause;
            else if (frame.action === 'compose-end') delay += imeComposeEndPause;

            delay += Math.sin(index * 0.9 + 0.35) * imeWaveAmount;
            return Math.max(imeMinDelay, Math.round(delay));
        };
    }

    function renderImeFrame(doc, trackEl, frame, composeClassName) {
        if (frame.composing) {
            trackEl.textContent = frame.committed;
            const composeBox = doc.createElement('span');
            composeBox.className = composeClassName;
            composeBox.textContent = frame.composing;
            trackEl.appendChild(composeBox);
            return;
        }
        trackEl.textContent = frame.committed;
    }

    async function runPlainLine(context) {
        const line = context.line;
        const totalSteps = Math.max(line.text.length, 1);

        for (let idx = 0; idx <= line.text.length; idx += 1) {
            line.trackEl.textContent = line.text.slice(0, idx);
            context.emit('onLineStep', {
                player: context.player,
                lineIndex: context.lineIndex,
                lineId: line.lineId,
                strategy: line.strategy,
                step: idx,
                totalSteps: line.text.length,
                committed: line.trackEl.textContent,
                composing: ''
            });

            if (idx === line.text.length) break;
            const delay = context.getTypeDelay(line.text.charAt(idx), idx / totalSteps, 'default');
            const keepGoing = await context.scheduler.sleep(delay);
            if (!keepGoing) return false;
        }

        line.trackEl.classList.add(line.doneClass);
        return true;
    }

    async function runImeLine(context) {
        const line = context.line;
        const frames = buildImeFrames(line.text);
        const totalFrames = Math.max(frames.length - 1, 1);

        for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
            const frame = frames[frameIndex];
            renderImeFrame(context.doc, line.trackEl, frame, context.options.composeClassName);

            context.emit('onLineStep', {
                player: context.player,
                lineIndex: context.lineIndex,
                lineId: line.lineId,
                strategy: line.strategy,
                step: frameIndex,
                totalSteps: frames.length - 1,
                committed: frame.committed,
                composing: frame.composing,
                key: frame.key,
                keyType: frame.keyType,
                action: frame.action
            });

            if (frameIndex === frames.length - 1) break;
            const delay = context.getImeDelay(frame, frameIndex, totalFrames);
            const keepGoing = await context.scheduler.sleep(delay);
            if (!keepGoing) return false;
        }

        line.trackEl.textContent = line.text;
        line.trackEl.classList.add(line.doneClass);
        return true;
    }

    async function runInstantLine(context) {
        const line = context.line;
        line.trackEl.textContent = line.text;
        line.trackEl.classList.add(line.doneClass);
        context.emit('onLineStep', {
            player: context.player,
            lineIndex: context.lineIndex,
            lineId: line.lineId,
            strategy: STRATEGY.INSTANT,
            step: 1,
            totalSteps: 1,
            committed: line.text,
            composing: ''
        });
        return true;
    }

    function getStrategyRunner(name) {
        const normalized = String(name || STRATEGY.PLAIN).toLowerCase();
        if (normalized === STRATEGY.IME || normalized === 'ime') return runImeLine;
        if (normalized === STRATEGY.INSTANT) return runInstantLine;
        return runPlainLine;
    }

    function createTypingAnimation(userOptions) {
        const options = Object.assign({}, DEFAULT_OPTIONS, userOptions || {});
        const doc = global.document;
        if (!doc) return null;
        const configWarnings = [];
        const lines = normalizeLines(doc, options, function (code, message, details) {
            configWarnings.push({
                code: code,
                message: message,
                details: details || null
            });
        });
        if (!lines || lines.length === 0) {
            notifyConfigError(
                options,
                'NO_VALID_LINES',
                'No valid typing lines were resolved. Check container/track selectors and IDs.',
                { warnings: configWarnings }
            );
            return null;
        }

        if (configWarnings.length > 0) {
            configWarnings.forEach(function (item) {
                logDebugWarning(options, item.code, item.message, item.details);
            });
        }

        const reveal = normalizeReveal(doc, options);
        const emit = createEmitter(options);
        const scheduler = createScheduler(global);
        const getTypeDelay = createTypeDelayGetter(options);
        const getImeDelay = createImeDelayGetter(options, getTypeDelay);
        const reducedMotionMql = typeof global.matchMedia === 'function'
            ? global.matchMedia('(prefers-reduced-motion: reduce)')
            : null;
        const replayConfig = options.replay && typeof options.replay === 'object' ? options.replay : {};
        const a11yConfig = options.a11y && typeof options.a11y === 'object' ? options.a11y : {};
        const interactionConfig = options.interaction && typeof options.interaction === 'object' ? options.interaction : {};
        const startTriggerMode = toLowerSafe(options.startTrigger, 'immediate');
        const startTriggerEvent = String(options.startTriggerEvent || 'click');
        const startTarget = resolveElement(doc, options.startTriggerTarget, null) || lines[0].containerEl;
        const replayMode = toLowerSafe(replayConfig.mode, 'once');
        const replayCooldownMs = Math.max(0, toNumber(replayConfig.cooldownMs, 0));
        const replayMaxCount = toOptionalNumber(replayConfig.maxCount);
        const replayManualAllowed = replayConfig.manualReplayAllowed == null ? true : !!replayConfig.manualReplayAllowed;
        const replayInViewThreshold = clamp01(toNumber(replayConfig.inViewThreshold, 0.15));
        const preStartCursorBlinkMs = Math.max(0, toNumber(options.preStartCursorBlinkMs, 0));
        const a11ySkipEnabled = !!a11yConfig.skipEnabled;
        const a11ySkipKey = toLowerSafe(a11yConfig.skipKey, 'escape');
        const a11yAriaLive = toLowerSafe(a11yConfig.ariaLive, 'off');
        const interactionTarget = resolveElement(doc, interactionConfig.target, null) || startTarget;
        const interactionPauseOnHover = !!interactionConfig.pauseOnHover;
        const interactionClickToSkip = !!interactionConfig.clickToSkip;
        const interactionClickToReplay = !!interactionConfig.clickToReplay;
        const interactionHoverClass = typeof interactionConfig.hoverClass === 'string'
            ? interactionConfig.hoverClass
            : '';

        let status = STATUS.IDLE;
        let currentLineIndex = -1;
        let destroyed = false;
        let autoPausedByVisibility = false;
        let autoPausedByHover = false;
        let visibilityHandler = null;
        let keyHandler = null;
        let hoverInHandler = null;
        let hoverOutHandler = null;
        let interactionClickHandler = null;
        let startEventTarget = null;
        let startEventHandler = null;
        let viewObserver = null;
        let runToken = 0;
        let playCount = 0;
        let lastCompleteAt = 0;
        let lastStartAt = 0;
        let lastStartSource = 'manual';
        let player = null;

        lines.forEach(function (line) {
            const shouldLockWidth = line.lockWidth == null
                ? options.lockLineWidth !== false
                : !!line.lockWidth;
            if (shouldLockWidth) {
                setFixedWidth(doc, line.containerEl, line.text, line.widthPadding);
            } else {
                line.containerEl.style.width = '';
                line.containerEl.style.maxWidth = '100%';
            }
            if (a11yAriaLive !== 'off') {
                line.trackEl.setAttribute('aria-live', a11yAriaLive);
                line.trackEl.setAttribute('aria-atomic', 'true');
            }
        });

        function setStatus(nextStatus) {
            if (status === nextStatus) return;
            const prev = status;
            status = nextStatus;
            emit('onStateChange', {
                player: player,
                previous: prev,
                current: nextStatus
            });
        }

        function clearDom() {
            lines.forEach(function (line) {
                line.trackEl.textContent = '';
                line.trackEl.classList.remove(line.doneClass);
                if (line.activateClass) line.activateTargetEl.classList.remove(line.activateClass);
            });
            reveal.items.forEach(function (item) {
                item.el.classList.remove(reveal.visibleClass);
            });
        }

        function finalizeDom() {
            lines.forEach(function (line) {
                if (line.activateClass) line.activateTargetEl.classList.add(line.activateClass);
                line.trackEl.textContent = line.text;
                line.trackEl.classList.add(line.doneClass);
            });
            reveal.items.forEach(function (item) {
                item.el.classList.add(reveal.visibleClass);
            });
        }

        function canStartByPolicy(source) {
            if (replayMaxCount != null && playCount >= replayMaxCount) return false;

            if (playCount > 0 && replayCooldownMs > 0) {
                const elapsed = Date.now() - lastCompleteAt;
                if (elapsed < replayCooldownMs) return false;
            }

            if (source === 'auto') {
                if (replayMode === 'manual' && playCount > 0) return false;
                if (replayMode === 'once' && playCount > 0) return false;
            } else if (source === 'manual') {
                if (replayMode === 'once' && playCount > 0 && !replayManualAllowed) return false;
            }

            return true;
        }

        function getRemainingCooldownMs() {
            if (playCount === 0 || replayCooldownMs <= 0 || lastCompleteAt <= 0) return 0;
            const elapsed = Date.now() - lastCompleteAt;
            return Math.max(0, replayCooldownMs - elapsed);
        }

        function bindVisibility() {
            if (!options.pauseWhenHidden || visibilityHandler || typeof doc.addEventListener !== 'function') return;
            visibilityHandler = function () {
                if (doc.hidden) {
                    if (status === STATUS.RUNNING) player.pause(true, false);
                    return;
                }
                if (status === STATUS.PAUSED && autoPausedByVisibility) {
                    autoPausedByVisibility = false;
                    player.resume();
                }
            };
            doc.addEventListener('visibilitychange', visibilityHandler);
        }

        function unbindVisibility() {
            if (!visibilityHandler || typeof doc.removeEventListener !== 'function') return;
            doc.removeEventListener('visibilitychange', visibilityHandler);
            visibilityHandler = null;
        }

        function bindKeyboardControl() {
            if (!a11ySkipEnabled || keyHandler || typeof doc.addEventListener !== 'function') return;
            keyHandler = function (event) {
                const key = toLowerSafe(event.key, '');
                const code = toLowerSafe(event.code, '');
                const isEscAlias = a11ySkipKey === 'escape' && (key === 'esc' || code === 'esc');
                const isMatch = key === a11ySkipKey || code === a11ySkipKey || isEscAlias;
                if (!isMatch) return;
                if (status !== STATUS.RUNNING && status !== STATUS.PAUSED) return;

                event.preventDefault();
                player.skip();
            };
            doc.addEventListener('keydown', keyHandler);
        }

        function unbindKeyboardControl() {
            if (!keyHandler || typeof doc.removeEventListener !== 'function') return;
            doc.removeEventListener('keydown', keyHandler);
            keyHandler = null;
        }

        function bindInteractionControl() {
            if (!interactionTarget || typeof interactionTarget.addEventListener !== 'function') return;

            if (interactionPauseOnHover && !hoverInHandler && !hoverOutHandler) {
                hoverInHandler = function () {
                    if (interactionHoverClass) interactionTarget.classList.add(interactionHoverClass);
                    if (status !== STATUS.RUNNING) return;
                    autoPausedByHover = true;
                    player.pause(false, true);
                };
                hoverOutHandler = function () {
                    if (interactionHoverClass) interactionTarget.classList.remove(interactionHoverClass);
                    if (status === STATUS.PAUSED && autoPausedByHover) {
                        autoPausedByHover = false;
                        player.resume();
                    }
                };

                interactionTarget.addEventListener('mouseenter', hoverInHandler);
                interactionTarget.addEventListener('mouseleave', hoverOutHandler);
            }

            if ((interactionClickToSkip || interactionClickToReplay) && !interactionClickHandler) {
                interactionClickHandler = function () {
                    if (interactionClickToSkip && status === STATUS.RUNNING) {
                        if (Date.now() - lastStartAt < 180) return;
                        player.skip();
                        return;
                    }

                    if (!interactionClickToReplay) return;
                    if (status === STATUS.COMPLETED || status === STATUS.CANCELLED) {
                        player.play();
                    }
                };
                interactionTarget.addEventListener('click', interactionClickHandler);
            }
        }

        function unbindInteractionControl() {
            if (!interactionTarget || typeof interactionTarget.removeEventListener !== 'function') return;

            if (hoverInHandler) {
                interactionTarget.removeEventListener('mouseenter', hoverInHandler);
                hoverInHandler = null;
            }
            if (hoverOutHandler) {
                interactionTarget.removeEventListener('mouseleave', hoverOutHandler);
                hoverOutHandler = null;
            }
            if (interactionClickHandler) {
                interactionTarget.removeEventListener('click', interactionClickHandler);
                interactionClickHandler = null;
            }
        }

        function bindStartInteractionTrigger() {
            if (startTriggerMode !== 'interaction' || options.autoStart === false) return;
            if (startEventHandler) return;
            if (!startTarget || typeof startTarget.addEventListener !== 'function') return;

            startEventTarget = startTarget;
            startEventHandler = function () {
                startEventHandler = null;
                startEventTarget = null;
                player.play(true);
            };
            startEventTarget.addEventListener(startTriggerEvent, startEventHandler, { once: true });
        }

        function unbindStartInteractionTrigger() {
            if (!startEventTarget || !startEventHandler) return;
            startEventTarget.removeEventListener(startTriggerEvent, startEventHandler);
            startEventTarget = null;
            startEventHandler = null;
        }

        function bindViewObserver() {
            const needsObserver = startTriggerMode === 'in-view' || replayMode === 'on-visible';
            if (!needsObserver) return;
            if (viewObserver || !startTarget) return;

            if (typeof global.IntersectionObserver !== 'function') {
                if (options.autoStart !== false && startTriggerMode === 'in-view') {
                    player.play(true);
                }
                return;
            }

            viewObserver = new global.IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;

                    if (status === STATUS.IDLE && options.autoStart !== false && startTriggerMode === 'in-view') {
                        player.play(true);
                        if (replayMode !== 'on-visible' && viewObserver) {
                            viewObserver.disconnect();
                            viewObserver = null;
                        }
                        return;
                    }

                    if (replayMode === 'on-visible' && (status === STATUS.COMPLETED || status === STATUS.CANCELLED)) {
                        player.play(true);
                    }
                });
            }, { threshold: replayInViewThreshold });

            viewObserver.observe(startTarget);
        }

        function unbindViewObserver() {
            if (!viewObserver) return;
            viewObserver.disconnect();
            viewObserver = null;
        }

        async function runReveal() {
            if (!reveal.enabled || reveal.items.length === 0) return true;

            let elapsed = 0;
            for (const item of reveal.items) {
                const targetDelay = reveal.baseDelay + item.order * reveal.step;
                const wait = Math.max(0, targetDelay - elapsed);
                if (wait > 0) {
                    const keepGoing = await scheduler.sleep(wait);
                    if (!keepGoing) return false;
                }
                item.el.classList.add(reveal.visibleClass);
                elapsed = targetDelay;
            }

            return true;
        }

        async function runSequence(activeToken) {
            const shouldReduce = reducedMotionMql
                && reducedMotionMql.matches
                && String(options.reducedMotionBehavior || 'instant') !== 'animate';

            if (shouldReduce) {
                finalizeDom();
                return { ok: true, reducedMotion: true };
            }

            if (preStartCursorBlinkMs > 0) {
                const keepGoing = await scheduler.sleep(preStartCursorBlinkMs);
                if (!keepGoing) return { ok: false };
            }

            for (let idx = 0; idx < lines.length; idx += 1) {
                if (activeToken !== runToken || scheduler.isCancelled()) return { ok: false };

                const line = lines[idx];
                currentLineIndex = idx;

                if (line.delayBefore > 0) {
                    const keepGoing = await scheduler.sleep(line.delayBefore);
                    if (!keepGoing) return { ok: false };
                }

                if (line.activateClass) line.activateTargetEl.classList.add(line.activateClass);

                emit('onLineStart', {
                    player: player,
                    lineIndex: idx,
                    lineId: line.lineId,
                    strategy: line.strategy,
                    text: line.text
                });

                const runner = getStrategyRunner(line.strategy);
                const done = await runner({
                    player: player,
                    doc: doc,
                    options: options,
                    scheduler: scheduler,
                    emit: emit,
                    getTypeDelay: getTypeDelay,
                    getImeDelay: getImeDelay,
                    line: line,
                    lineIndex: idx
                });
                if (!done) return { ok: false };

                emit('onLineEnd', {
                    player: player,
                    lineIndex: idx,
                    lineId: line.lineId,
                    strategy: line.strategy,
                    text: line.text
                });

                if (line.delayAfter > 0) {
                    const keepGoing = await scheduler.sleep(line.delayAfter);
                    if (!keepGoing) return { ok: false };
                }
            }

            if (!(await runReveal())) return { ok: false };
            return { ok: true, reducedMotion: false };
        }

        function play(isAuto) {
            const source = isAuto ? 'auto' : 'manual';
            if (destroyed) return false;
            if (status === STATUS.RUNNING) return true;
            if (status === STATUS.PAUSED) return resume();
            if (!canStartByPolicy(source)) return false;

            runToken += 1;
            const activeToken = runToken;

            scheduler.reset();
            autoPausedByVisibility = false;
            autoPausedByHover = false;
            currentLineIndex = -1;
            clearDom();
            bindVisibility();
            lastStartSource = source;
            lastStartAt = Date.now();
            playCount += 1;

            setStatus(STATUS.RUNNING);
            emit('onPlay', {
                player: player,
                source: source,
                playCount: playCount
            });

            runSequence(activeToken).then(function (result) {
                if (activeToken !== runToken) return;
                unbindVisibility();

                if (result.ok) {
                    setStatus(STATUS.COMPLETED);
                    lastCompleteAt = Date.now();
                    emit('onComplete', {
                        player: player,
                        reducedMotion: !!result.reducedMotion,
                        skipped: false,
                        source: lastStartSource,
                        playCount: playCount
                    });
                    return;
                }

                if (status === STATUS.RUNNING || status === STATUS.PAUSED) {
                    setStatus(STATUS.CANCELLED);
                    emit('onCancel', { player: player, reason: 'cancelled' });
                }
            }).catch(function (error) {
                if (activeToken !== runToken) return;
                unbindVisibility();
                setStatus(STATUS.CANCELLED);
                emit('onError', { player: player, error: error });
            });

            return true;
        }

        function canPlay(source) {
            if (destroyed) return false;
            if (status === STATUS.RUNNING || status === STATUS.PAUSED) return true;
            return canStartByPolicy(source === 'auto' ? 'auto' : 'manual');
        }

        function pause(fromVisibility, fromHover) {
            if (destroyed || status !== STATUS.RUNNING) return false;
            scheduler.pause();
            autoPausedByVisibility = !!fromVisibility;
            autoPausedByHover = !!fromHover;
            setStatus(STATUS.PAUSED);
            emit('onPause', {
                player: player,
                byVisibility: autoPausedByVisibility,
                byHover: autoPausedByHover
            });
            return true;
        }

        function resume() {
            if (destroyed || status !== STATUS.PAUSED) return false;
            autoPausedByVisibility = false;
            autoPausedByHover = false;
            scheduler.resume();
            setStatus(STATUS.RUNNING);
            emit('onResume', { player: player });
            return true;
        }

        function cancel(reason) {
            if (destroyed) return false;
            if (status === STATUS.IDLE || status === STATUS.COMPLETED || status === STATUS.CANCELLED) return false;
            runToken += 1;
            scheduler.cancel();
            unbindVisibility();
            autoPausedByHover = false;
            autoPausedByVisibility = false;
            setStatus(STATUS.CANCELLED);
            emit('onCancel', { player: player, reason: reason || 'manual-cancel' });
            return true;
        }

        function skip() {
            if (destroyed) return false;
            if (status === STATUS.COMPLETED) return true;
            runToken += 1;
            scheduler.cancel();
            unbindVisibility();
            autoPausedByHover = false;
            autoPausedByVisibility = false;
            finalizeDom();
            setStatus(STATUS.COMPLETED);
            lastCompleteAt = Date.now();
            emit('onComplete', {
                player: player,
                reducedMotion: false,
                skipped: true,
                source: lastStartSource,
                playCount: playCount
            });
            return true;
        }

        function destroy() {
            if (destroyed) return;
            runToken += 1;
            scheduler.cancel();
            unbindVisibility();
            unbindKeyboardControl();
            unbindInteractionControl();
            unbindStartInteractionTrigger();
            unbindViewObserver();
            destroyed = true;
            setStatus(STATUS.DESTROYED);
        }

        function getState() {
            return {
                status: status,
                currentLineIndex: currentLineIndex,
                isPaused: scheduler.isPaused(),
                isCancelled: scheduler.isCancelled(),
                destroyed: destroyed,
                playCount: playCount,
                lastStartSource: lastStartSource,
                replayMode: replayMode,
                replayManualAllowed: replayManualAllowed,
                replayCooldownMs: replayCooldownMs,
                remainingCooldownMs: getRemainingCooldownMs(),
                canPlayManual: canPlay('manual'),
                canPlayAuto: canPlay('auto')
            };
        }

        player = {
            version: VERSION,
            options: options,
            play: play,
            canPlay: canPlay,
            pause: pause,
            resume: resume,
            cancel: cancel,
            skip: skip,
            destroy: destroy,
            reset: clearDom,
            getState: getState
        };

        emit('onInit', { player: player });
        bindKeyboardControl();
        bindInteractionControl();
        bindViewObserver();
        bindStartInteractionTrigger();

        if (options.autoStart !== false) {
            if (startTriggerMode === 'immediate') {
                player.play(true);
            } else if (startTriggerMode !== 'in-view' && startTriggerMode !== 'interaction') {
                player.play(true);
            }
        }

        return player;
    }

    function initHeroTyping(userOptions) {
        const player = createTypingAnimation(Object.assign({}, userOptions || {}, { autoStart: true }));
        return !!player;
    }

    const TypingAnimationLib = {
        version: VERSION,
        defaults: DEFAULT_OPTIONS,
        status: STATUS,
        strategies: STRATEGY,
        initHeroTyping: initHeroTyping,
        init: initHeroTyping,
        createTypingAnimation: createTypingAnimation,
        create: createTypingAnimation
    };

    global.TypingAnimationLib = TypingAnimationLib;
    global.initHeroTyping = initHeroTyping;
    global.createTypingAnimation = createTypingAnimation;
})(window);
