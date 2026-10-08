import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';

import {TableChartButton} from '../TableChart';
import type {ChartData} from '../../../services/research/chart';

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {open: jest.fn().mockResolvedValue(undefined)},
}));
// SvgXml needs the native renderer; the string it is given is what matters here.
jest.mock('react-native-svg', () => {
  const {Text} = require('react-native');
  return {SvgXml: ({xml}: any) => <Text testID="svg-xml">{xml}</Text>};
});
jest.mock('../../Sheet/Sheet', () => {
  const {View} = require('react-native');
  const MockSheet = ({children, isVisible}: any) =>
    isVisible ? <View testID="sheet">{children}</View> : null;
  MockSheet.ScrollView = ({children, ...props}: any) => (
    <View {...props}>{children}</View>
  );
  return {Sheet: MockSheet};
});

const data: ChartData = {
  labelHead: 'Item',
  labels: ['Apel', 'Pir'],
  series: [
    {name: 'Qty', values: [3, 10]},
    {name: 'Price', values: [1.5, 2.25]},
  ],
};

describe('TableChartButton', () => {
  it('opens a sheet with a bar chart and switches views and series', () => {
    const {getByTestId, queryByTestId} = render(
      <TableChartButton data={data} language="en" />,
    );
    expect(queryByTestId('sheet')).toBeNull();
    fireEvent.press(getByTestId('table-chart-open'));
    const xml = () => getByTestId('svg-xml').props.children as string;
    expect(xml()).toContain('<rect');
    expect(xml()).not.toContain('currentColor');
    expect(xml()).not.toContain('<title>');

    fireEvent.press(getByTestId('chart-type-line'));
    expect(xml()).toContain('stroke-linejoin');
    fireEvent.press(getByTestId('chart-type-pie'));
    expect(xml()).toContain('<path');

    // hiding a series drops its colour; the last visible one cannot be hidden
    fireEvent.press(getByTestId('chart-type-bar'));
    fireEvent.press(getByTestId('chart-series-0'));
    expect(xml()).not.toContain('#0d7f55');
    fireEvent.press(getByTestId('chart-series-1'));
    expect(xml()).toContain('#3b82f6');
  });

  it('offers a pie only when the first series is non-negative', () => {
    const neg: ChartData = {
      ...data,
      series: [{name: 'Delta', values: [-1, 2]}],
    };
    const {getByTestId, queryByTestId} = render(
      <TableChartButton data={neg} language="id" />,
    );
    fireEvent.press(getByTestId('table-chart-open'));
    expect(queryByTestId('chart-type-pie')).toBeNull();
  });
});
