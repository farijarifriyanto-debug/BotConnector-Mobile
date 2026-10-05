import React from 'react';
import {observer} from 'mobx-react';

import {Screen1Hero} from '../../assets/onboarding/illustrations';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {OnboardingContent} from './components/OnboardingContent';
import {useOnboardingHandlers} from './useOnboardingHandlers';
import {uiStore} from '../../store';

export const Onboarding1Screen: React.FC = observer(() => {
  const {l10n, skip} = useOnboardingHandlers(1);
  const isIndonesian = uiStore.language === 'id';
  const intro = isIndonesian
    ? {
        eyebrow: 'BotConnector',
        title: 'AI Cloud & Local',
        body: 'Gunakan model Cloud melalui akun BotConnector, atau jalankan AI lokal di perangkat Anda. Pilih model kapan saja langsung dari obrolan.',
        cta: 'Mulai',
      }
    : {
        eyebrow: 'BotConnector',
        title: 'Cloud & Local AI',
        body: 'Use Cloud models through your BotConnector account, or run Local AI on your device. Switch models anytime directly from chat.',
        cta: 'Get Started',
      };
  return (
    <OnboardingScaffold
      step={1}
      illustration={<Screen1Hero width={112} height={112} />}
      content={
        <OnboardingContent
          eyebrow={intro.eyebrow}
          title={intro.title}
          body={intro.body}
        />
      }
      bottomBar={
        <OnboardingBottomBar
          primaryLabel={intro.cta}
          onPrimary={skip}
          showBack={false}
          backAccessibilityLabel={l10n.onboarding.back}
        />
      }
    />
  );
});
