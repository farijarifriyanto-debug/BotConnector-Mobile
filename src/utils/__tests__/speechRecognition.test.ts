import {resolveSpeechLocale} from '../speechRecognition';

describe('resolveSpeechLocale', () => {
  it('prefers the device locale so speech matches how the user talks', () => {
    expect(resolveSpeechLocale('en', 'id-ID')).toBe('id-ID');
    expect(resolveSpeechLocale('id', 'en-US')).toBe('en-US');
  });

  it('falls back to the in-app language when the device locale is unsupported', () => {
    expect(resolveSpeechLocale('id', 'tr-TR')).toBe('id-ID');
    expect(resolveSpeechLocale('pt', 'xx-YY')).toBe('pt-BR');
  });

  it('accepts raw BCP-47 tags not present in the table', () => {
    expect(resolveSpeechLocale('nl', 'nl-NL')).toBe('nl-NL');
    expect(resolveSpeechLocale('de-DE')).toBe('de-DE');
    expect(resolveSpeechLocale(undefined, 'tr-TR')).toBe('tr-TR');
  });

  it('defaults to en-US when nothing resolvable is available', () => {
    expect(resolveSpeechLocale('nl')).toBe('en-US');
    expect(resolveSpeechLocale(undefined, undefined)).toBe('en-US');
    expect(resolveSpeechLocale(undefined, 'en')).toBe('en-US');
  });
});
