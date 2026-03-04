(function (global) {
    'use strict';

    const VERSION = '1.0.0';
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
        imeBeatPattern: [0.88, 1.06, 0.82, 1.12, 0.94, 1.03]
    });

    function initHeroTyping(userOptions) {
        const options = Object.assign({}, DEFAULT_OPTIONS, userOptions || {});

        const doc = global.document;
        const typedEl = doc.getElementById(options.typedId);
        const typedSecondEl = doc.getElementById(options.typedSecondId);
        const typedTrack = doc.getElementById(options.typedTrackId);
        const typedSecondTrack = doc.getElementById(options.typedSecondTrackId);
        if (!typedEl || !typedTrack || !typedSecondEl || !typedSecondTrack) return false;

        const firstText = typedEl.dataset.text || options.firstFallbackText;
        const secondText = typedSecondEl.dataset.text || options.secondFallbackText;
        const heroItems = Array.from(doc.querySelectorAll(options.heroRevealSelector)).sort(
            (a, b) => Number(a.dataset.heroOrder || 0) - Number(b.dataset.heroOrder || 0)
        );

        const setFixedWidth = (container, text, extraWidth) => {
            const measure = doc.createElement('span');
            measure.className = 'hero-typed';
            measure.style.position = 'absolute';
            measure.style.visibility = 'hidden';
            measure.style.pointerEvents = 'none';
            measure.textContent = text;
            container.parentNode.appendChild(measure);
            container.style.width = Math.ceil(measure.getBoundingClientRect().width + extraWidth) + 'px';
            measure.remove();
        };

        setFixedWidth(typedEl, firstText, options.firstWidthPadding);
        setFixedWidth(typedSecondEl, secondText, options.secondWidthPadding);

        if (global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            typedTrack.textContent = firstText;
            typedTrack.classList.add('is-done');
            typedSecondEl.classList.add('is-active');
            typedSecondTrack.textContent = secondText;
            typedSecondTrack.classList.add('is-done');
            heroItems.forEach((el) => el.classList.add('is-visible'));
            return true;
        }

        const clamp01 = (value) => Math.min(1, Math.max(0, value));
        const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
        const getTypeDelay = (char, progress, lane) => {
            const p = clamp01(progress || 0);
            const eased = easeInOutSine(p);
            const edgeWeight = Math.abs(eased - 0.5) * 2;
            const laneBase = lane === 'ime' ? 52 : 48;
            const laneRange = lane === 'ime' ? 28 : 22;
            let delay = laneBase + edgeWeight * laneRange + Math.floor(Math.random() * 16);

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

        const revealHeroItems = () => {
            heroItems.forEach((el, seqIdx) => {
                const order = Number(el.dataset.heroOrder || seqIdx);
                setTimeout(() => {
                    el.classList.add('is-visible');
                }, options.revealBaseDelay + order * options.revealStep);
            });
        };

        const typeText = (trackEl, text, done) => {
            let index = 0;
            const totalSteps = Math.max(text.length, 1);

            const next = () => {
                if (index <= text.length) {
                    trackEl.textContent = text.slice(0, index);
                    const progress = index / totalSteps;
                    index += 1;
                    const currentChar = text.charAt(index - 1);
                    setTimeout(next, getTypeDelay(currentChar, progress, 'default'));
                    return;
                }

                done();
            };

            next();
        };

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
        const L_INDEX = Object.fromEntries(L_COMPAT.map((char, idx) => [char, idx]));
        const V_INDEX = Object.fromEntries(V_COMPAT.map((char, idx) => [char, idx]));
        const T_INDEX = Object.fromEntries(T_COMPAT.map((char, idx) => [char, idx]));
        const CONSONANTS = new Set(Object.keys(L_INDEX).concat(['ㄳ', 'ㄵ', 'ㄶ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅄ']));
        const VOWELS = new Set(Object.keys(V_INDEX));

        const composeHangul = (l, v, t) => {
            if (!l) return '';
            if (!v) return l;

            const lIndex = L_INDEX[l];
            const vIndex = V_INDEX[v];
            const tIndex = T_INDEX[t || ''] || 0;

            if (lIndex == null || vIndex == null) return l + v + (t || '');
            return String.fromCharCode(HANGUL_BASE + lIndex * 588 + vIndex * 28 + tIndex);
        };

        const syllableToKeys = (char) => {
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
        };

        const buildImeFrames = (text) => {
            const frames = [];
            let committed = '';
            let l = '';
            let v = '';
            let t = '';

            const getComposing = () => composeHangul(l, v, t);
            const getKeyType = (jamo) => {
                if (CONSONANTS.has(jamo)) return 'consonant';
                if (VOWELS.has(jamo)) return 'vowel';
                return 'other';
            };
            const pushFrame = (jamo, prevCommitted, prevComposing) => {
                const composing = getComposing();
                const committedAdvanced = committed.length > prevCommitted.length;
                let action = 'steady';

                if (committedAdvanced && composing) {
                    action = 'carry';
                } else if (committedAdvanced && !composing) {
                    action = 'commit';
                } else if (!committedAdvanced && composing && prevComposing && composing !== prevComposing) {
                    action = 'compose-shift';
                } else if (composing && !prevComposing) {
                    action = 'compose-start';
                } else if (!composing && prevComposing) {
                    action = 'compose-end';
                }

                frames.push({
                    committed,
                    composing,
                    key: jamo || '',
                    keyType: getKeyType(jamo || ''),
                    action
                });
            };
            const flushComposing = () => {
                const composing = getComposing();
                if (composing) {
                    committed += composing;
                    l = '';
                    v = '';
                    t = '';
                }
            };

            const processJamo = (jamo) => {
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
            };

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
            frames.push({
                committed,
                composing: '',
                key: '',
                keyType: 'other',
                action: 'final'
            });
            return frames;
        };

        const getImeDelay = (frame, index, totalFrames) => {
            const progress = index / totalFrames;
            const lastChar = (frame.composing || frame.committed || '').slice(-1);
            let delay = getTypeDelay(lastChar, progress, 'ime');
            delay *= options.imeBeatPattern[index % options.imeBeatPattern.length];

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

        const typeComposedText = (trackEl, text, done) => {
            const frames = buildImeFrames(text);
            let frameIndex = 0;
            const totalFrames = Math.max(frames.length - 1, 1);

            const next = () => {
                if (frameIndex >= frames.length) {
                    trackEl.textContent = text;
                    done();
                    return;
                }

                const frame = frames[frameIndex];
                if (frame.composing) {
                    trackEl.textContent = frame.committed;
                    const composeBox = doc.createElement('span');
                    composeBox.className = 'hero-compose-box';
                    composeBox.textContent = frame.composing;
                    trackEl.appendChild(composeBox);
                } else {
                    trackEl.textContent = frame.committed;
                }
                const delay = getImeDelay(frame, frameIndex, totalFrames);
                frameIndex += 1;
                setTimeout(next, delay);
            };

            next();
        };

        const startSecondLine = () => {
            typedSecondEl.classList.add('is-active');
            typeComposedText(typedSecondTrack, secondText, () => {
                typedSecondTrack.classList.add('is-done');
                setTimeout(revealHeroItems, options.afterSecondDelay);
            });
        };

        const startFirstLine = () => {
            typeText(typedTrack, firstText, () => {
                typedTrack.classList.add('is-done');
                setTimeout(startSecondLine, options.betweenDelay);
            });
        };

        setTimeout(startFirstLine, options.startDelay);
        return true;
    }

    const TypingAnimationLib = {
        version: VERSION,
        defaults: DEFAULT_OPTIONS,
        initHeroTyping: initHeroTyping,
        init: initHeroTyping
    };

    global.TypingAnimationLib = TypingAnimationLib;
    global.initHeroTyping = initHeroTyping;
})(window);
