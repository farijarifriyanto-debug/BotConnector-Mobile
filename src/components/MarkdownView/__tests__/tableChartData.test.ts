import {marked} from 'marked';
import {parseDocument} from 'htmlparser2';
import {findOne} from 'domutils';
import type {Element} from 'domhandler';

import {chartDataFromTable} from '../TableRenderers';

const tableOf = (md: string): Element =>
  findOne(
    el => el.name === 'table',
    parseDocument(marked(md) as string).children,
  ) as Element;

describe('chartDataFromTable', () => {
  const md =
    '| Bulan | Pendapatan | Biaya | Catatan |\n|---|---|---|---|\n| Jan | 1.200 | 800 | **ok** |\n| Feb | 1.500 | 900 | naik |\n| Mar | 1.100 | 950 | turun |\n| Total | 3.800 | 2.650 | - |';

  it('reads labels and numeric columns from the rendered table, ignoring the totals row', () => {
    const d = chartDataFromTable(tableOf(md), true);
    expect(d?.labels).toEqual(['Jan', 'Feb', 'Mar']);
    expect(d?.series.map(s => s.name)).toEqual(['Pendapatan', 'Biaya']);
    expect(d?.series[0].values).toEqual([1200, 1500, 1100]);
  });

  it('reads English-formatted numbers when not Indonesian', () => {
    const d = chartDataFromTable(
      tableOf('| m | v |\n|---|---|\n| a | 1,200 |\n| b | 3,500 |'),
      false,
    );
    expect(d?.series[0].values).toEqual([1200, 3500]);
  });

  it('is not chartable without numbers or with one row', () => {
    expect(
      chartDataFromTable(
        tableOf('| a | b |\n|---|---|\n| x | y |\n| z | w |'),
        false,
      ),
    ).toBeNull();
    expect(
      chartDataFromTable(tableOf('| a | b |\n|---|---|\n| x | 1 |'), false),
    ).toBeNull();
  });
});
