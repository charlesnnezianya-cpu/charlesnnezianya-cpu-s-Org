import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Web Speech API Type Definitions (cross-browser safe for TypeScript)
// ============================================================================

interface BrowserSpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionResultList {
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionResult;
}

interface BrowserSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: BrowserSpeechRecognition, ev: Event) => unknown) | null;
  onresult:
    | ((this: BrowserSpeechRecognition, ev: BrowserSpeechRecognitionEvent) => unknown)
    | null;
  onerror:
    | ((this: BrowserSpeechRecognition, ev: BrowserSpeechRecognitionErrorEvent) => unknown)
    | null;
  onend: ((this: BrowserSpeechRecognition, ev: Event) => unknown) | null;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

// ============================================================================
// Capability & Error Helpers
// ============================================================================

export function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as SpeechWindow;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

export function formatSpeechRecognitionError(errorCode?: string): string {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was denied. Allow microphone access in your browser site settings and try again.';
    case 'audio-capture':
      return 'No microphone was detected. Connect or enable a microphone and try again.';
    case 'no-speech':
      return 'No speech was detected. Check your microphone and speak clearly close to the device.';
    case 'network':
      return 'Speech recognition could not reach the browser speech service. Check your connection and try again.';
    case 'language-not-supported':
      return 'Your current browser language is not supported for voice dictation.';
    default:
      return 'Voice input encountered an issue. Please check microphone access or type your question directly.';
  }
}

// ============================================================================
// Academic Text-to-Speech Sanitizer & Chunker
// ============================================================================

const SPOKEN_MATH_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\times/g, ' times '],
  [/\\cdot/g, ' times '],
  [/\\div/g, ' divided by '],
  [/\\pm/g, ' plus or minus '],
  [/\\mp/g, ' minus or plus '],
  [/\\leq/g, ' less than or equal to '],
  [/\\geq/g, ' greater than or equal to '],
  [/\\neq/g, ' not equal to '],
  [/\\approx/g, ' approximately equal to '],
  [/\\equiv/g, ' is equivalent to '],
  [/\\propto/g, ' is proportional to '],
  [/\\infty/g, ' infinity '],
  [/\\rightarrow|\\to/g, ' leads to '],
  [/\\leftarrow/g, ' from '],
  [/\\leftrightarrow/g, ' is reversible with '],
  [/\\rightleftharpoons/g, ' is in equilibrium with '],
  [/\\Rightarrow/g, ' implies '],
  [/\\alpha/g, ' alpha '],
  [/\\beta/g, ' beta '],
  [/\\gamma/g, ' gamma '],
  [/\\delta/g, ' delta '],
  [/\\Delta/g, ' delta '],
  [/\\epsilon/g, ' epsilon '],
  [/\\theta/g, ' theta '],
  [/\\lambda/g, ' lambda '],
  [/\\mu/g, ' mu '],
  [/\\pi/g, ' pi '],
  [/\\rho/g, ' rho '],
  [/\\sigma/g, ' sigma '],
  [/\\Sigma/g, ' sum '],
  [/\\tau/g, ' tau '],
  [/\\phi/g, ' phi '],
  [/\\omega/g, ' omega '],
  [/\\Omega/g, ' ohm '],
  [/\\int/g, ' integral of '],
  [/\\sum/g, ' sum of '],
  [/\\partial/g, ' partial '],
  [/\\nabla/g, ' del '],
  [/\\degree|\^\\circ/g, ' degrees '],
];

function cleanMathForSpeech(expr: string): string {
  let out = expr;
  out = out.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, ' $1 over $2 ');
  out = out.replace(/\\sqrt\{([^{}]+)\}/g, ' square root of $1 ');
  out = out.replace(/\\text\{([^{}]+)\}/g, ' $1 ');
  out = out.replace(/\\left|\\right/g, '');
  for (const [pattern, spoken] of SPOKEN_MATH_REPLACEMENTS) {
    out = out.replace(pattern, spoken);
  }
  out = out.replace(/\^\{([^}]+)\}/g, ' to the power of $1 ');
  out = out.replace(/\^(\d+|[a-zA-Z])/g, ' to the power of $1 ');
  out = out.replace(/_\{([^}]+)\}/g, ' sub $1 ');
  out = out.replace(/[{}\\]/g, ' ');
  return out;
}

export function prepareTextForSpeech(markdownContent: string): string {
  if (!markdownContent) return '';

  let text = markdownContent;

  // Replace structured educational diagram tags with a natural spoken reference
  text = text.replace(/\[\[DIAGRAM:([\s\S]*?)\]\]/g, (_match, jsonBody: string) => {
    try {
      const parsed = JSON.parse(jsonBody) as { title?: string };
      if (parsed?.title) {
        return ` Diagram shown: ${parsed.title}. `;
      }
    } catch {
      // ignore malformed diagram JSON
    }
    return ' Educational diagram included. ';
  });

  // Summarize long fenced code blocks cleanly instead of reading raw syntax characters aloud
  text = text.replace(/```[^\n]*\n([\s\S]*?)```/g, (_match, codeBody: string) => {
    const cleanCode = (codeBody || '').trim();
    if (cleanCode.length > 140) {
      return ' Code example shown on screen. ';
    }
    return ` ${cleanCode.replace(/[`{}[\];]/g, ' ')} `;
  });

  // Clean display and inline LaTeX math
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, expr: string) => cleanMathForSpeech(expr));
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, expr: string) => cleanMathForSpeech(expr));
  text = text.replace(/\\\(([^\n]+?)\\\)/g, (_m, expr: string) => cleanMathForSpeech(expr));
  text = text.replace(
    /\$(?!\s)([^$\n]*?(?:[a-zA-Z\\_^=+\-*/(){}])[^$\n]*?)\$/g,
    (_m, expr: string) => cleanMathForSpeech(expr)
  );

  // Strip Markdown table separator lines and format table rows naturally
  text = text.replace(/^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*$/gm, '');
  text = text.replace(/^\s*\|(.+)\|\s*$/gm, (_m, row: string) => {
    const cells = row
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    return cells.length > 0 ? `${cells.join(', ')}.` : '';
  });

  // Strip Markdown links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1');

  // Strip Markdown formatting markers
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^>\s*(?:\[!(?:KEY|NOTE|TIP)\]\s*)?/gim, '');
  text = text.replace(/^[-*•]\s+/gm, '');
  text = text.replace(/^\d+[.)]\s+/gm, '');
  text = text.replace(/^---+$/gm, '');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');

  // Clean up whitespace while preserving sentence pauses at newlines
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\n{2,}/g, '. ');
  text = text.replace(/\n+/g, '. ');
  text = text.replace(/\.\s*\./g, '.');
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

export function splitTextIntoSpeechChunks(text: string, maxChunkLength = 200): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunkLength) return [cleaned];

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushOversizedSentence = (sentence: string) => {
    const clauses = sentence
      .split(/(?<=[,;:])\s+/)
      .map((c) => c.trim())
      .filter(Boolean);

    let subCurrent = '';
    for (const clause of clauses) {
      if (clause.length > maxChunkLength) {
        if (subCurrent) {
          chunks.push(subCurrent);
          subCurrent = '';
        }
        const words = clause.split(/\s+/);
        let wordChunk = '';
        for (const word of words) {
          if (!wordChunk) {
            wordChunk = word;
          } else if (wordChunk.length + 1 + word.length <= maxChunkLength) {
            wordChunk = `${wordChunk} ${word}`;
          } else {
            chunks.push(wordChunk);
            wordChunk = word;
          }
        }
        if (wordChunk) chunks.push(wordChunk);
      } else if (!subCurrent) {
        subCurrent = clause;
      } else if (subCurrent.length + 1 + clause.length <= maxChunkLength) {
        subCurrent = `${subCurrent} ${clause}`;
      } else {
        chunks.push(subCurrent);
        subCurrent = clause;
      }
    }
    if (subCurrent) chunks.push(subCurrent);
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChunkLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      pushOversizedSentence(sentence);
    } else if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= maxChunkLength) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

// ============================================================================
// Voice Input Hook (Speech-to-Text for Chatbot Input)
// ============================================================================

export function joinDraftWithTranscript(baseText: string, dictatedText: string): string {
  const cleanDictated = dictatedText.trimStart();
  if (!cleanDictated) return baseText;
  if (!baseText.trim()) return cleanDictated;
  const separator = /\s$/.test(baseText) ? '' : ' ';
  return `${baseText}${separator}${cleanDictated}`;
}

interface UseChatbotVoiceInputOptions {
  currentInput: string;
  onInputChange: (nextText: string) => void;
  onError: (message: string) => void;
}

export function useChatbotVoiceInput({
  currentInput,
  onInputChange,
  onError,
}: UseChatbotVoiceInputOptions) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const baseInputRef = useRef('');
  const finalTranscriptRef = useRef('');
  const cancelRequestedRef = useRef(false);
  const currentInputRef = useRef(currentInput);
  const onInputChangeRef = useRef(onInputChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    currentInputRef.current = currentInput;
  }, [currentInput]);

  useEffect(() => {
    onInputChangeRef.current = onInputChange;
  }, [onInputChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const cleanupRecognition = useCallback((mode: 'stop' | 'abort') => {
    const rec = recognitionRef.current;
    if (!rec) return;
    recognitionRef.current = null;
    try {
      if (mode === 'abort') rec.abort();
      else rec.stop();
    } catch {
      // ignore already-stopped recognition errors
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelRequestedRef.current = true;
      cleanupRecognition('abort');
    };
  }, [cleanupRecognition]);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onErrorRef.current(
        'Voice input is not supported in this browser. Try Chrome, Edge, or Safari, or type your question directly.'
      );
      return;
    }

    if (recognitionRef.current) {
      cleanupRecognition('abort');
    }

    cancelRequestedRef.current = false;
    baseInputRef.current = currentInputRef.current;
    finalTranscriptRef.current = '';
    setInterimTranscript('');

    try {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang =
        (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        if (cancelRequestedRef.current) return;

        let nextFinal = '';
        let nextInterim = '';

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            nextFinal += text;
          } else {
            nextInterim += text;
          }
        }

        finalTranscriptRef.current = nextFinal;
        setInterimTranscript(nextInterim.trim());

        const combinedSpeech = `${nextFinal}${nextInterim}`.trim();
        const updatedDraft = joinDraftWithTranscript(baseInputRef.current, combinedSpeech);
        onInputChangeRef.current(updatedDraft);
      };

      recognition.onerror = (event) => {
        if (cancelRequestedRef.current || event.error === 'aborted') return;
        setIsListening(false);
        setInterimTranscript('');
        recognitionRef.current = null;
        onErrorRef.current(formatSpeechRecognitionError(event.error));
      };

      recognition.onend = () => {
        const wasCancelled = cancelRequestedRef.current;
        recognitionRef.current = null;
        setIsListening(false);
        setInterimTranscript('');

        if (wasCancelled) {
          onInputChangeRef.current(baseInputRef.current);
          return;
        }

        const finalText = finalTranscriptRef.current.trim();
        if (finalText) {
          onInputChangeRef.current(
            joinDraftWithTranscript(baseInputRef.current, finalText)
          );
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: unknown) {
      recognitionRef.current = null;
      setIsListening(false);
      setInterimTranscript('');
      onErrorRef.current(
        err instanceof Error && err.message
          ? `Could not start voice input: ${err.message}`
          : 'Could not start microphone dictation. Please verify browser permissions.'
      );
    }
  }, [cleanupRecognition]);

  const stopListening = useCallback(() => {
    cancelRequestedRef.current = false;
    setIsListening(false);
    setInterimTranscript('');
    cleanupRecognition('stop');
  }, [cleanupRecognition]);

  const cancelListening = useCallback(() => {
    cancelRequestedRef.current = true;
    setIsListening(false);
    setInterimTranscript('');
    cleanupRecognition('abort');
    onInputChangeRef.current(baseInputRef.current);
  }, [cleanupRecognition]);

  return {
    isSupported: isSpeechRecognitionSupported(),
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    cancelListening,
  };
}

// ============================================================================
// Spoken AI Response Hook (Chunked Text-to-Speech Playback)
// ============================================================================

export type SpeechPlaybackStatus = 'idle' | 'speaking' | 'paused';

export function useChatbotSpeechPlayback(onError: (message: string) => void) {
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [status, setStatus] = useState<SpeechPlaybackStatus>('idle');

  const playbackTokenRef = useRef(0);
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const statusRef = useRef<SpeechPlaybackStatus>('idle');
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const clearTimers = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    playbackTokenRef.current += 1;
    chunksRef.current = [];
    chunkIndexRef.current = 0;
    statusRef.current = 'idle';
    activeUtteranceRef.current = null;
    setStatus('idle');
    setActiveMessageId(null);

    if (isSpeechSynthesisSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore browser cleanup errors
      }
    }
  }, [clearTimers]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const speakChunk = useCallback((index: number, token: number) => {
    if (token !== playbackTokenRef.current) return;
    if (!isSpeechSynthesisSupported()) return;

    const chunks = chunksRef.current;
    if (index >= chunks.length) {
      statusRef.current = 'idle';
      activeUtteranceRef.current = null;
      setStatus('idle');
      setActiveMessageId(null);
      return;
    }

    chunkIndexRef.current = index;
    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang =
      (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    utterance.rate = 1;
    utterance.pitch = 1;
    activeUtteranceRef.current = utterance;

    utterance.onend = () => {
      if (token !== playbackTokenRef.current) return;
      if (statusRef.current === 'paused') return;
      speakChunk(index + 1, token);
    };

    utterance.onerror = (event) => {
      if (token !== playbackTokenRef.current) return;
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      stop();
      onErrorRef.current(
        'Audio playback could not complete in this browser. Check device audio or browser speech support.'
      );
    };

    window.speechSynthesis.speak(utterance);
  }, [stop]);

  const playMessage = useCallback(
    (messageId: string, markdownContent: string) => {
      if (!isSpeechSynthesisSupported()) {
        onErrorRef.current(
          'Spoken AI responses (Text-to-Speech) are not supported in this browser.'
        );
        return;
      }

      const spokenText = prepareTextForSpeech(markdownContent);
      const chunks = splitTextIntoSpeechChunks(spokenText);
      if (chunks.length === 0) {
        onErrorRef.current('There is no readable text in this response.');
        return;
      }

      clearTimers();
      playbackTokenRef.current += 1;
      const token = playbackTokenRef.current;

      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore pre-cancel errors
      }

      chunksRef.current = chunks;
      chunkIndexRef.current = 0;
      statusRef.current = 'speaking';
      setActiveMessageId(messageId);
      setStatus('speaking');

      // Short delay after cancel() avoids Chrome dropping the immediately queued utterance
      window.setTimeout(() => {
        if (token === playbackTokenRef.current) {
          speakChunk(0, token);
        }
      }, 30);
    },
    [clearTimers, speakChunk]
  );

  const pause = useCallback(() => {
    if (!isSpeechSynthesisSupported() || statusRef.current !== 'speaking') return;
    clearTimers();
    statusRef.current = 'paused';
    setStatus('paused');
    try {
      window.speechSynthesis.pause();
    } catch {
      // ignore if browser only supports stop/restart fallback
    }
  }, [clearTimers]);

  const resume = useCallback(() => {
    if (!isSpeechSynthesisSupported() || statusRef.current !== 'paused') return;
    clearTimers();
    statusRef.current = 'speaking';
    setStatus('speaking');
    const token = playbackTokenRef.current;

    try {
      window.speechSynthesis.resume();
    } catch {
      // fallback handled below
    }

    // Safety fallback for mobile browsers where pause/resume drops the utterance
    resumeTimerRef.current = window.setTimeout(() => {
      if (token !== playbackTokenRef.current || statusRef.current !== 'speaking') return;
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        speakChunk(chunkIndexRef.current, token);
      }
    }, 220);
  }, [clearTimers, speakChunk]);

  return {
    isSupported: isSpeechSynthesisSupported(),
    activeMessageId,
    status,
    playMessage,
    pause,
    resume,
    stop,
  };
}
