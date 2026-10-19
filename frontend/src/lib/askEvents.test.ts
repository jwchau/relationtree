import { describe, expect, it } from 'vitest';
import { applyAskEvent, createLineSplitter, initialAnswer, type AskEvent } from './askEvents';

describe('createLineSplitter', () => {
  it('returns only complete lines, holding a partial line for the next chunk', () => {
    const split = createLineSplitter();

    expect(split('{"tool":"Look')).toEqual([]);
    expect(split('ing up Ann…"}\n{"text":"Ann"}\n{"te')).toEqual([
      '{"tool":"Looking up Ann…"}',
      '{"text":"Ann"}',
    ]);
    expect(split('xt":" is here."}\n')).toEqual(['{"text":" is here."}']);
  });

  it('skips blank lines', () => {
    expect(createLineSplitter()('\n{"text":"a"}\n\n')).toEqual(['{"text":"a"}']);
  });
});

describe('applyAskEvent', () => {
  const play = (events: AskEvent[]) => events.reduce(applyAskEvent, initialAnswer);

  it('shows progress until the answer starts, then accumulates text and the people', () => {
    expect(play([{ tool: 'Looking up Ann…' }])).toMatchObject({
      progress: 'Looking up Ann…',
      text: '',
    });

    const done = play([
      { tool: 'Looking up Ann…' },
      { text: 'Ann is ' },
      { text: 'here.' },
      { people: [{ id: '1', name: 'Ann' }] },
    ]);

    expect(done).toEqual({
      progress: null,
      text: 'Ann is here.',
      people: [{ id: '1', name: 'Ann' }],
      error: null,
      done: true,
    });
  });

  it('keeps the partial answer when the AI stops mid-way', () => {
    expect(play([{ text: 'Ann is' }, { error: 'AI is unavailable right now' }])).toMatchObject({
      text: 'Ann is',
      error: 'AI is unavailable right now',
      progress: null,
      done: true,
    });
  });
});
