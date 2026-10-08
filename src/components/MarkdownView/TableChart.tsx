import React, {useContext, useMemo, useState} from 'react';
import {Alert, Dimensions, TouchableOpacity, View} from 'react-native';

import {Text} from 'react-native-paper';
import {SvgXml} from 'react-native-svg';
import RNFS from '@dr.pogodin/react-native-fs';
import Share from 'react-native-share';

import {Sheet} from '../Sheet';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {
  canPie,
  chartSvg,
  PALETTE,
  type ChartData,
  type ChartType,
} from '../../services/research/chart';

const fmt = (lang: string, o: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', o).format;

interface Props {
  data: ChartData;
  language: string;
}

/** "Chart" pill above a table; opens a sheet with bar / line / pie views, series toggles and a share action. */
export const TableChartButton: React.FC<Props> = ({data, language}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ChartType>('bar');
  const [off, setOff] = useState<ReadonlySet<number>>(new Set());

  const pie = useMemo(() => canPie(data), [data]);
  const svg = useMemo(() => {
    const shown = data.series
      .map((s, i) => ({...s, color: PALETTE[i % PALETTE.length], i}))
      .filter(s => !off.has(s.i));
    // react-native-svg has no currentColor inheritance from the app theme: paint it with the text color
    return chartSvg({...data, series: shown}, type, {
      compact: fmt(language, {notation: 'compact', maximumFractionDigits: 2}),
      full: fmt(language, {maximumFractionDigits: 4}),
      titles: false,
    }).replace(/currentColor/g, theme.colors.onSurface);
  }, [data, off, type, language, theme.colors.onSurface]);

  const width = Math.min(Dimensions.get('window').width - 32, 720);
  const c = l10n.chat.chart;

  const toggleSeries = (i: number) =>
    setOff(prev => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else if (next.size < data.series.length - 1) {
        next.add(i); // the last visible series cannot be hidden
      }
      return next;
    });

  const share = async () => {
    try {
      const path = `${RNFS.CachesDirectoryPath}/chart-${Date.now()}.svg`;
      await RNFS.writeFile(path, svg, 'utf8');
      await Share.open({
        url: `file://${path}`,
        type: 'image/svg+xml',
        failOnCancel: false,
      });
    } catch {
      Alert.alert('BotConnector', c.shareError);
    }
  };

  const pill = (
    label: string,
    active: boolean,
    onPress: () => void,
    testID: string,
  ) => (
    <TouchableOpacity
      key={testID}
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.outline,
        backgroundColor: active ? theme.colors.primaryContainer : undefined,
        marginRight: 8,
        marginBottom: 8,
      }}>
      <Text style={{color: theme.colors.onSurface, fontSize: 13}}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <View style={{flexDirection: 'row', justifyContent: 'flex-end'}}>
        {pill(c.button, false, () => setOpen(true), 'table-chart-open')}
      </View>
      <Sheet
        isVisible={open}
        onClose={() => setOpen(false)}
        title={c.title}
        snapPoints={['75%']}>
        <Sheet.ScrollView
          contentContainerStyle={{paddingHorizontal: 16, paddingTop: 8}}
          testID="table-chart-sheet">
          <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
            {pill(
              c.bar,
              type === 'bar',
              () => setType('bar'),
              'chart-type-bar',
            )}
            {pill(
              c.line,
              type === 'line',
              () => setType('line'),
              'chart-type-line',
            )}
            {pie &&
              pill(
                c.pie,
                type === 'pie',
                () => setType('pie'),
                'chart-type-pie',
              )}
          </View>
          {data.series.length > 1 && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
              {data.series.map((s, i) =>
                pill(
                  s.name.slice(0, 18),
                  !off.has(i),
                  () => toggleSeries(i),
                  `chart-series-${i}`,
                ),
              )}
            </View>
          )}
          <SvgXml
            xml={svg}
            width={width}
            height={(width * 360) / 640}
            testID="table-chart-svg"
          />
          <View style={{flexDirection: 'row', marginTop: 8, marginBottom: 24}}>
            {pill(c.share, false, share, 'chart-share')}
          </View>
        </Sheet.ScrollView>
      </Sheet>
    </>
  );
};
