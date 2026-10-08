import React from 'react';

import {WebSearchResultBubble} from '../../components/WebSearchResultCard';

import {TalentUI} from './TalentUIRegistry';
import {TalentResult} from './types';

/** Deep research shows its numbered sources the same way a web search shows its hits. */
export class DeepResearchTalentUI implements TalentUI {
  readonly name = 'deep_research';

  renderResult(result: TalentResult): React.ReactNode {
    if (result.type !== 'search') {
      return null;
    }
    return (
      <WebSearchResultBubble query={result.query} results={result.results} />
    );
  }
}
