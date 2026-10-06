import React from 'react';
import {Alert, Linking, Platform} from 'react-native';
import {render as baseRender, fireEvent} from '../../../../jest/test-utils';
import {AboutScreen} from '../AboutScreen';
import {submitFeedback} from '../../../api/feedback';
import {l10n} from '../../../locales';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

// Mock DeviceInfo
// isEmulator is async in react-native-device-info; the render path reaches it
// through checkGpuSupport().
jest.mock('react-native-device-info', () => ({
  getVersion: jest.fn().mockReturnValue('1.0.0'),
  getBuildNumber: jest.fn().mockReturnValue('100'),
  isEmulator: jest.fn().mockResolvedValue(false),
}));

// Mock Clipboard
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

// Mock Linking - need to spy on the actual Linking object
const mockOpenURL = jest.fn().mockImplementation(() => Promise.resolve());
jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL);

// Mock feedback API
jest.mock('../../../api/feedback', () => ({
  submitFeedback: jest.fn().mockResolvedValue(undefined),
}));

jest.spyOn(Alert, 'alert');

describe('AboutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const {getByText, getByTestId} = render(<AboutScreen />);

    // The account card is rendered above the about card.
    expect(getByTestId('botconnector-account-card')).toBeTruthy();
    // Exact match: the app title only. The card says "...to BotConnector".
    expect(getByText('BotConnector')).toBeTruthy();
    expect(getByText('v1.0.0 (100)')).toBeTruthy();
    expect(getByText(l10n.en.about.supportProject)).toBeTruthy();
    expect(getByText(l10n.en.about.githubButton)).toBeTruthy();
  });

  it('copies version to clipboard when version button is pressed', () => {
    const {getByText} = render(<AboutScreen />);

    fireEvent.press(getByText('v1.0.0 (100)'));

    expect(Alert.alert).toHaveBeenCalledWith(
      l10n.en.about.versionCopiedTitle,
      l10n.en.about.versionCopiedDescription,
    );
  });

  it('opens GitHub URL when GitHub button is pressed', () => {
    const {getByText} = render(<AboutScreen />);

    fireEvent.press(getByText('Star on GitHub'));

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://github.com/farijarifriyanto-debug/BotConnector-Mobile',
    );
  });

  describe.each(['android', 'ios'] as const)('on %s', os => {
    const originalOS = Platform.OS;

    beforeEach(() => {
      Platform.OS = os;
    });

    afterEach(() => {
      Platform.OS = originalOS;
    });

    it('shows only the GitHub support option while feedback is disabled', () => {
      const {queryByText, getByText} = render(<AboutScreen />);

      expect(queryByText('Become a Sponsor')).toBeNull();
      expect(queryByText('or')).toBeNull();
      expect(getByText(l10n.en.about.githubButton)).toBeTruthy();
      // FEEDBACK_ENABLED is false: no dead "Share thoughts" entry point.
      expect(queryByText(l10n.en.about.orBy)).toBeNull();
      expect(queryByText(l10n.en.feedback.shareThoughtsButton)).toBeNull();
    });
  });

  // The feedback form (open / submit / validation / API error) is unreachable
  // while FEEDBACK_ENABLED=false (commit 7433521: no button that cannot
  // succeed). Re-add those flow tests together with the flag.
  it('never submits feedback while the feedback entry point is disabled', () => {
    const {queryByText} = render(<AboutScreen />);

    expect(queryByText(l10n.en.feedback.shareThoughtsButton)).toBeNull();
    expect(submitFeedback).not.toHaveBeenCalled();
  });
});
