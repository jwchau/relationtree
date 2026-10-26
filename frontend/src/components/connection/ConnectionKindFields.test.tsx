// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionKindFields } from './ConnectionKindFields';

describe('ConnectionKindFields', () => {
  it('asks a parent link for its kind, showing the current one', () => {
    render(<ConnectionKindFields type="PARENT" parentKind="STEP" ended={false} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Kind' })).toHaveTextContent('Step');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('asks a spouse link whether the partnership has ended', () => {
    const onChange = vi.fn();
    render(<ConnectionKindFields type="SPOUSE" parentKind={null} ended={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Former partner' }));
    expect(onChange).toHaveBeenCalledWith({ parentKind: null, ended: true });
    expect(screen.queryByRole('combobox', { name: 'Kind' })).not.toBeInTheDocument();
  });

  it('asks nothing of other links', () => {
    const { container } = render(
      <ConnectionKindFields type="FRIEND" parentKind={null} ended={false} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
