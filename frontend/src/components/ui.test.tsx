import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterChips } from './ui'

describe('FilterChips', () => {
  it('通过公开的 pressed 状态和回调切换筛选项', async () => {
    const onChange = vi.fn()
    render(<FilterChips label="文章栏目" options={['全部', '摄影']} value="全部" onChange={onChange} />)

    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: '摄影' }))
    expect(onChange).toHaveBeenCalledWith('摄影')
  })
})
