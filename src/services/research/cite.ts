/**
 * Numbered citations for Deep research answers. The model writes "[1]", "[2, 3]"; the app turns each valid number
 * into a tappable markdown link to that source and removes numbers that point to no source (an invented citation).
 * Text inside code is left alone.
 */
export interface CitationSource {
  url: string;
  title?: string;
}

const CODE = /(```[\s\S]*?```|`[^`\n]*`)/g;

export function applyCitations(
  text: string,
  sources: ReadonlyMap<number, CitationSource>,
): string {
  if (sources.size === 0) {
    return text;
  }
  return text
    .split(CODE)
    .map((part, i) => {
      if (i % 2) {
        return part;
      }
      return part
        .replace(/\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})+)\]/g, (_m, list: string) =>
          list
            .split(/\s*[,;]\s*/)
            .map(n => `[${n}]`)
            .join(''),
        )
        .replace(/ ?\[(\d{1,3})\](?!\()/g, (m, n: string) => {
          const s = sources.get(Number(n));
          if (!s || !/^https?:\/\//i.test(s.url)) {
            return '';
          }
          // "[\[n\]](url)": the link text is the literal "[n]"; parentheses in the url would end the link early
          return ` [\\[${n}\\]](${s.url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
        });
    })
    .join('');
}

interface OutcomeLike {
  toolName?: string;
  result?: {
    type?: string;
    results?: Array<{id?: number; url?: string; title?: string}>;
  };
}

/** The numbered sources a turn's deep_research calls returned, by the number the model cites. */
export function citationSourcesFromSteps(
  steps: ReadonlyArray<{toolOutcomes?: ReadonlyArray<OutcomeLike>}> | undefined,
): Map<number, CitationSource> {
  const out = new Map<number, CitationSource>();
  for (const step of steps ?? []) {
    for (const o of step.toolOutcomes ?? []) {
      if (o.toolName !== 'deep_research' || o.result?.type !== 'search') {
        continue;
      }
      for (const r of o.result.results ?? []) {
        if (typeof r.id === 'number' && typeof r.url === 'string') {
          out.set(r.id, {url: r.url, title: r.title});
        }
      }
    }
  }
  return out;
}
