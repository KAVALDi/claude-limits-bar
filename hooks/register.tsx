import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const isShown = atom({ plugin: 'limits', key: 'isShown' } as const, false)

const T = {
  en: {
    five: '5h', week: '7d', h: 'h', d: 'd', m: 'm', now: 'now',
    desc: 'Show or hide the usage limits band above the prompt',
    shown: 'Limits band shown.', hidden: 'Limits band hidden.',
  },
  ru: {
    five: '5ч', week: '7д', h: 'ч', d: 'д', m: 'м', now: 'сейчас',
    desc: 'Показать или скрыть полосу лимитов над полем ввода',
    shown: 'Полоса лимитов показана.', hidden: 'Полоса лимитов скрыта.',
  },
}
let t = T.en

type Limit = { kind: string; percentUsed: number; resetsAt?: string }

let limits: Limit[] = []

const left = (l: Limit) => Math.max(0, Math.round(100 - l.percentUsed))

const until = (iso: string | undefined) => {
  if (!iso) return '?'
  const ms = Date.parse(iso) - Date.now()
  if (ms <= 0) return t.now
  const m = Math.floor(ms / 60000)
  const d = Math.floor(m / 1440)
  const hh = Math.floor((m % 1440) / 60)
  const mm = m % 60
  return d > 0 ? `${d}${t.d} ${hh}${t.h}` : hh > 0 ? `${hh}${t.h} ${mm}${t.m}` : `${mm}${t.m}`
}

const p2 = (n: number) => String(n).padStart(2, '0')

// 5h: h:mm. 7d: d:hh (no minutes from a full day), under a day d:hh:mm.
const clock = (iso: string | undefined, isWeek: boolean) => {
  if (!iso) return '?'
  const m = Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (!isWeek) return `${Math.floor(m / 60)}:${p2(mm)}`
  return d >= 1 ? `${d}:${p2(h)}` : `0:${p2(h)}:${p2(mm)}`
}

const mini = (pct: number) => {
  const n = Math.round((pct / 100) * 6)
  return '█'.repeat(n) + '░'.repeat(6 - n)
}

const part = (name: string, l: Limit | undefined, isWeek: boolean) =>
  l ? `${name} ${mini(left(l))} ${left(l)}% ${clock(l.resetsAt, isWeek)}` : `${name} —`

const summary = () => {
  const five = limits.find(l => l.kind === 'five_hour')
  const week = limits.find(l => l.kind === 'seven_day')
  return { five, week, text: `${part(t.five, five, false)} | ${part(t.week, week, true)}` }
}

async function refresh($: any) {
  try {
    const u = await $.session.usage()
    limits = u.rateLimits ?? []
    $.ui.status(limits.length ? summary().text : undefined)
  } catch {}
}

export const register: Register = (on, options) => {
  t = options?.language === 'ru' ? T.ru : T.en

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'limits', description: t.desc })
    await refresh($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    limits = e.rateLimits ?? []
    $.ui.status(limits.length ? summary().text : undefined)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'limits' }, async $ => {
    const next = !(await read($, isShown))
    await update($, isShown, () => next)
    return { text: next ? t.shown : t.hidden }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!limits.length || !(await read($, isShown))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const { five, week } = summary()
    const W = 14

    const bar = (l: Limit | undefined, dim: boolean) => {
      const pct = l ? left(l) : 0
      const filled = Math.round((pct / 100) * W)
      const color = pct > 50 ? '#4ade80' : pct > 20 ? '#facc15' : '#ef4444'
      return (
        <Text>
          <Text color={color} dimColor={dim}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(W - filled)}</Text>
        </Text>
      )
    }
    const pctOf = (l: Limit | undefined) => (l ? left(l) + '%' : '—')
    const timeOf = (l: Limit | undefined) => (l ? until(l.resetsAt) : '?')

    const group = (name: string, l: Limit | undefined, dim: boolean) => (
      <Box gap={1}>
        <Text bold>{name}</Text>
        <Text dimColor>{pctOf(l)}</Text>
        {bar(l, dim)}
        <Text dimColor>{timeOf(l)}</Text>
      </Box>
    )

    return (
      <Box justifyContent="space-between" paddingX={1}>
        {group(t.five, five, false)}
        {group(t.week, week, false)}
      </Box>
    )
  })
}
