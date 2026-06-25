import { useCallback, useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

// Speech-to-text for the assistant. Supports two modes:
//   • 'auto' — continuous; sends after `pauseMs` of silence (configurable).
//   • 'hold' — push-to-talk; accumulate while held, send on release.
// `speakingRef` (a ref the caller flips true while TTS plays) drives barge-in:
// while the assistant is talking we discard any picked-up audio (echo) and fire
// onSpeechStart so the caller can stop the reply and let the user take over.
export function useVoiceInput({ mode = 'auto', pauseMs = 1200, speakingRef, onFinal, onSpeechStart }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef(null);
  const wantRef = useRef(false);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const silenceRef = useRef(null);
  const spokeRef = useRef(false);
  const cb = useRef({});
  cb.current = { onFinal, onSpeechStart };
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pauseR = useRef(pauseMs);
  pauseR.current = pauseMs;

  const clearSilence = () => { if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; } };

  const emitFinal = useCallback(() => {
    clearSilence();
    const text = `${finalRef.current} ${interimRef.current}`.replace(/\s+/g, ' ').trim();
    finalRef.current = '';
    interimRef.current = '';
    spokeRef.current = false;
    setInterim('');
    if (text) cb.current.onFinal?.(text);
  }, []);

  const ensureRec = useCallback(() => {
    if (recRef.current || !SR) return recRef.current;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      // Barge-in: if the assistant is mid-sentence, treat any speech as an
      // interruption, drop the echo captured so far, and let the caller stop TTS.
      if (speakingRef?.current) {
        let any = '';
        for (let i = e.resultIndex; i < e.results.length; i++) any += e.results[i][0].transcript;
        if (any.trim()) {
          finalRef.current = '';
          interimRef.current = '';
          setInterim('');
          cb.current.onSpeechStart?.();
        }
        return;
      }
      let interimTxt = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalRef.current += `${res[0].transcript} `;
        else interimTxt += res[0].transcript;
      }
      interimRef.current = interimTxt;
      setInterim(`${finalRef.current}${interimTxt}`.trim());
      if (!spokeRef.current && (finalRef.current.trim() || interimTxt.trim())) {
        spokeRef.current = true;
        cb.current.onSpeechStart?.();
      }
      if (modeRef.current === 'auto') {
        clearSilence();
        silenceRef.current = setTimeout(emitFinal, pauseR.current);
      }
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (wantRef.current) { try { rec.start(); } catch { /* already running */ } }
      else setListening(false);
    };
    recRef.current = rec;
    return rec;
  }, [emitFinal, speakingRef]);

  const start = useCallback(() => {
    if (!SR) return;
    const rec = ensureRec();
    finalRef.current = '';
    interimRef.current = '';
    spokeRef.current = false;
    setInterim('');
    wantRef.current = true;
    setListening(true);
    try { rec.start(); } catch { /* already running */ }
  }, [ensureRec]);

  const stop = useCallback((emit = false) => {
    wantRef.current = false;
    clearSilence();
    if (emit) emitFinal();
    setListening(false);
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, [emitFinal]);

  useEffect(() => () => {
    wantRef.current = false;
    clearSilence();
    try { recRef.current?.abort?.(); } catch { /* noop */ }
  }, []);

  return { supported: !!SR, listening, interim, start, stop };
}
