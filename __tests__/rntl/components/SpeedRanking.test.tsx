/** My models ranks measured models by writing speed; unmeasured ones are left out. */
import React from 'react';
import { render } from '@testing-library/react-native';
import { SpeedRankingCard } from '../../../src/components/models/SpeedRanking';
import { useAppStore } from '../../../src/stores/appStore';
import { useSpeedStats } from '../../../src/atlasTools/speed';
import { createDownloadedModel } from '../../utils/factories';

describe('SpeedRankingCard', () => {
  it('lists the fastest measured model first and hides unmeasured ones', () => {
    useAppStore.setState({ downloadedModels: [
      createDownloadedModel({ id: 'a', name: 'Slow One' }), createDownloadedModel({ id: 'b', name: 'Quick One' }),
      createDownloadedModel({ id: 'c', name: 'Never Used' }),
    ] });
    useSpeedStats.setState({ byModel: { a: { decode: 4, prefill: 30, outLen: 0, samples: 3 }, b: { decode: 18, prefill: 120, outLen: 0, samples: 2 } } as any });
    const view = render(<SpeedRankingCard />);
    const names = view.getAllByText(/One$/).map(n => n.props.children);
    expect(names).toEqual(['Quick One', 'Slow One']);
    expect(view.queryByText('Never Used')).toBeNull();
  });

  it('shows nothing before any model was measured', () => {
    useSpeedStats.setState({ byModel: {} });
    expect(render(<SpeedRankingCard />).toJSON()).toBeNull();
  });
});
