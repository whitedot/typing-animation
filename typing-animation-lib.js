(function (global) {
    'use strict';

    const VERSION = '1.1.0';
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
        startDelay: 260,
        betweenDelay: 680,
        afterSecondDelay: 1000,
        revealBaseDelay: 90,
        revealStep: 160,
        imeBeatPattern: [0.88, 1.06, 0.82, 1.12, 0.94, 1.03],
        lines: null,
        autoStart: true,
        pauseWhenHidden: true,
        reducedMotionBehavior: 'instant',
        composeClassName: 'hero-compose-box',
        hooks: null,
        randomFn: null
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
        container.style.width = Math.ceil(measure.getBoundingClientRect().width + extraWidth) + 'px';
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

    function normalizeLines(doc, options) {
        if (Array.isArray(options.lines) && options.lines.length > 0) {
            const lines = [];
            for (let idx = 0; idx < options.lines.length; idx += 1) {
                const input = options.lines[idx] || {};
                const containerEl = resolveElement(
                    doc,
                    input.container || input.containerEl || input.el || input.selector,
                    input.containerId || input.id || null
                );
                if (!containerEl) continue;

                let trackEl = resolveElement(doc, input.track || input.trackEl, input.trackId || null);
                if (!trackEl && typeof input.trackSelector === 'string') {
                    trackEl = containerEl.querySelector(input.trackSelector);
                }
                if (!trackEl) continue;

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
        if (!typedEl || !typedTrack || !typedSecondEl || !typedSecondTrack) return null;

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

        return function getTypeDelay(char, progress, lane) {
            const p = clamp01(progress || 0);
            const eased = easeInOutSine(p);
            const edgeWeight = Math.abs(eased - 0.5) * 2;
            const laneBase = lane === 'ime' ? 52 : 48;
            const laneRange = lane === 'ime' ? 28 : 22;
            let delay = laneBase + edgeWeight * laneRange + Math.floor(randomFn() * 16);

            if (!char) {
                delay += 18;
            } else if (char === ' ') {
                delay *= 0.62;
            } else if (/[,.!?]/.test(char)) {
                delay += 120;
            } else if (/^[ㄱ-ㅎㅏ-ㅣ]$/.test(char)) {
                delay -= 8;
            }

            delay += Math.sin(p * Math.PI * 4 + 0.8) * 6;
            return Math.max(34, Math.round(delay));
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
        return function getImeDelay(frame, index, totalFrames) {
            const progress = index / totalFrames;
            const lastChar = (frame.composing || frame.committed || '').slice(-1);
            const beatPattern = Array.isArray(options.imeBeatPattern) && options.imeBeatPattern.length > 0
                ? options.imeBeatPattern
                : DEFAULT_OPTIONS.imeBeatPattern;

            let delay = getTypeDelay(lastChar, progress, 'ime');
            delay *= beatPattern[index % beatPattern.length];

            if (frame.keyType === 'vowel') delay -= 8;
            if (frame.keyType === 'consonant') delay += 6;
            if (frame.action === 'commit') delay += 42;
            else if (frame.action === 'carry') delay += 26;
            else if (frame.action === 'compose-shift') delay += 14;
            else if (frame.action === 'compose-start') delay += 8;
            else if (frame.action === 'compose-end') delay += 12;

            delay += Math.sin(index * 0.9 + 0.35) * 4;
            return Math.max(34, Math.round(delay));
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

        const lines = normalizeLines(doc, options);
        if (!lines || lines.length === 0) return null;

        const reveal = normalizeReveal(doc, options);
        const emit = createEmitter(options);
        const scheduler = createScheduler(global);
        const getTypeDelay = createTypeDelayGetter(options);
        const getImeDelay = createImeDelayGetter(options, getTypeDelay);
        const reducedMotionMql = typeof global.matchMedia === 'function'
            ? global.matchMedia('(prefers-reduced-motion: reduce)')
            : null;

        let status = STATUS.IDLE;
        let currentLineIndex = -1;
        let destroyed = false;
        let autoPausedByVisibility = false;
        let visibilityHandler = null;
        let runToken = 0;
        let player = null;

        lines.forEach(function (line) {
            setFixedWidth(doc, line.containerEl, line.text, line.widthPadding);
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

        function bindVisibility() {
            if (!options.pauseWhenHidden || visibilityHandler || typeof doc.addEventListener !== 'function') return;
            visibilityHandler = function () {
                if (doc.hidden) {
                    if (status === STATUS.RUNNING) player.pause(true);
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

        function play() {
            if (destroyed) return false;
            if (status === STATUS.RUNNING) return true;
            if (status === STATUS.PAUSED) return resume();

            runToken += 1;
            const activeToken = runToken;

            scheduler.reset();
            autoPausedByVisibility = false;
            currentLineIndex = -1;
            clearDom();
            bindVisibility();

            setStatus(STATUS.RUNNING);
            emit('onPlay', { player: player });

            runSequence(activeToken).then(function (result) {
                if (activeToken !== runToken) return;
                unbindVisibility();

                if (result.ok) {
                    setStatus(STATUS.COMPLETED);
                    emit('onComplete', {
                        player: player,
                        reducedMotion: !!result.reducedMotion,
                        skipped: false
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

        function pause(fromVisibility) {
            if (destroyed || status !== STATUS.RUNNING) return false;
            scheduler.pause();
            autoPausedByVisibility = !!fromVisibility;
            setStatus(STATUS.PAUSED);
            emit('onPause', { player: player, byVisibility: autoPausedByVisibility });
            return true;
        }

        function resume() {
            if (destroyed || status !== STATUS.PAUSED) return false;
            autoPausedByVisibility = false;
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
            finalizeDom();
            setStatus(STATUS.COMPLETED);
            emit('onComplete', { player: player, reducedMotion: false, skipped: true });
            return true;
        }

        function destroy() {
            if (destroyed) return;
            runToken += 1;
            scheduler.cancel();
            unbindVisibility();
            destroyed = true;
            setStatus(STATUS.DESTROYED);
        }

        function getState() {
            return {
                status: status,
                currentLineIndex: currentLineIndex,
                isPaused: scheduler.isPaused(),
                isCancelled: scheduler.isCancelled(),
                destroyed: destroyed
            };
        }

        player = {
            version: VERSION,
            options: options,
            play: play,
            pause: pause,
            resume: resume,
            cancel: cancel,
            skip: skip,
            destroy: destroy,
            reset: clearDom,
            getState: getState
        };

        emit('onInit', { player: player });

        if (options.autoStart !== false) {
            player.play();
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
