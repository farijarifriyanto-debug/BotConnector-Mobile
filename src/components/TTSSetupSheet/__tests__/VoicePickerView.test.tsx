import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {VoicePickerView, filterSystemVoices} from '../VoicePickerView';

const renderView = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <VoicePickerView />
    </L10nContext.Provider>,
    {withBottomSheetProvider: true, withSafeArea: true},
  );

describe('VoicePickerView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.currentVoice = null;
      ttsStore.kittenDownloadState = 'not_installed';
      ttsStore.kokoroDownloadState = 'not_installed';
      ttsStore.supertonicDownloadState = 'not_installed';
    });
  });

  it('renders the system voices group plus one group per neural engine', () => {
    const {getByTestId} = renderView();
    // System voices need no download and must always be selectable.
    expect(getByTestId('tts-engine-group-system')).toBeTruthy();
    expect(getByTestId('tts-engine-group-kitten')).toBeTruthy();
    expect(getByTestId('tts-engine-group-kokoro')).toBeTruthy();
    expect(getByTestId('tts-engine-group-supertonic')).toBeTruthy();
  });

  it('filters system voices to the app language plus English', () => {
    const voices = [
      {
        id: 'a',
        name: 'Damayanti',
        engine: 'system' as const,
        language: 'id-ID',
      },
      {id: 'b', name: 'Samantha', engine: 'system' as const, language: 'en-US'},
      {id: 'c', name: 'Thomas', engine: 'system' as const, language: 'fr-FR'},
      {id: 'd', name: 'Samantha', engine: 'system' as const, language: 'en-US'},
    ];
    const out = filterSystemVoices(voices, 'id');
    expect(out.map(v => v.id)).toEqual(['a', 'b']);
  });

  it('prefers Enhanced id-ID system voices before Default voices', () => {
    const voices = [
      {
        id: 'default-id',
        name: 'Indonesia Default',
        engine: 'system' as const,
        language: 'id-ID',
        quality: 'Default' as const,
      },
      {
        id: 'enhanced-id',
        name: 'Indonesia Enhanced',
        engine: 'system' as const,
        language: 'id-ID',
        quality: 'Enhanced' as const,
      },
      {
        id: 'enhanced-en',
        name: 'English Enhanced',
        engine: 'system' as const,
        language: 'en-US',
        quality: 'Enhanced' as const,
      },
    ];
    const out = filterSystemVoices(voices, 'id');
    expect(out.map(v => v.id)).toEqual([
      'enhanced-id',
      'default-id',
      'enhanced-en',
    ]);
  });

  it('groups start collapsed when no current voice; tap expands', () => {
    const {getByTestId, queryByTestId} = renderView();
    // Collapsed → install button not rendered yet.
    expect(queryByTestId('tts-kitten-install-button')).toBeNull();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    expect(getByTestId('tts-kitten-install-button')).toBeTruthy();
  });

  it('expanded ready group exposes voice rows with preview', () => {
    runInAction(() => {
      ttsStore.kittenDownloadState = 'ready';
    });
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    expect(getByTestId('tts-voice-row-kitten-expr-voice-2-f')).toBeTruthy();
    expect(getByTestId('tts-voice-preview-kitten-expr-voice-2-f')).toBeTruthy();
  });

  it('expanded not-installed group shows engine install button', () => {
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kokoro'));
    expect(getByTestId('tts-kokoro-install-button')).toBeTruthy();
    fireEvent.press(getByTestId('tts-kokoro-install-button'));
    expect(ttsStore.downloadKokoro).toHaveBeenCalled();
  });

  it('tapping a ready voice calls setCurrentVoice and closes the sheet', () => {
    runInAction(() => {
      ttsStore.kittenDownloadState = 'ready';
    });
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    fireEvent.press(getByTestId('tts-voice-row-kitten-expr-voice-2-f'));
    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({id: 'expr-voice-2-f', engine: 'kitten'}),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalled();
  });

  it('default-expands the active engine group on first render', () => {
    runInAction(() => {
      ttsStore.kokoroDownloadState = 'ready';
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    const {getByTestId} = renderView();
    // Active group is expanded → voice rows visible without a manual toggle.
    expect(getByTestId('tts-voice-row-kokoro-af_heart')).toBeTruthy();
  });
});
