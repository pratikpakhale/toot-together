import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Survey, SurveyQuestion, SurveyResponseValue } from 'posthog-js'
import { create } from 'zustand'
import { PROTOCOL_VERSION } from '../../sim/protocol'
import type { Results as RunResults } from '../../sim/types'
import { activeSurvey, subscribeSurveys, SURVEY_IDS, surveySent, surveyShown } from '../analytics'
import { audio } from '../audio/audio'
import { isTouch } from '../platform'
import { useProgress } from '../state/progress'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { Modal } from './Modal'

type Answers = Record<string, SurveyResponseValue>

/** Questions we know how to draw; the rest of a survey (links) is skipped. */
type Question = Exclude<SurveyQuestion, { type: 'link' }> & { id: string }
const questionsOf = (survey: Survey) => survey.questions.filter((q): q is Question => !!q.id && q.type !== 'link')

const useSurvey = (id: string | undefined) => useSyncExternalStore(subscribeSurveys, () => activeSurvey(id))

const FACES: Record<number, IconName[]> = {
  2: ['hippoGrumpy', 'hippoLove'],
  3: ['hippoGrumpy', 'hippoMeh', 'hippoLove'],
  5: ['hippoGrumpy', 'hippoTired', 'hippoMeh', 'hippo', 'hippoLove'],
}

function Rating({ question, value, onPick }: { question: Extract<SurveyQuestion, { type: 'rating' }>; value: SurveyResponseValue | undefined; onPick: (n: number) => void }) {
  // PostHog's 0–10 scale is an NPS one; every other scale starts at 1.
  const from = question.scale === 10 ? 0 : 1
  const steps = Array.from({ length: question.scale - from + 1 }, (_, i) => from + i)
  const faces = question.display === 'emoji' ? FACES[question.scale] : undefined
  const label = (n: number) => `${n} of ${question.scale}${n === from && question.lowerBoundLabel ? `: ${question.lowerBoundLabel}` : ''}${n === question.scale && question.upperBoundLabel ? `: ${question.upperBoundLabel}` : ''}`
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {steps.map((n, i) => (
        <button
          key={n}
          className={`flex size-11 items-center justify-center rounded-full border-[3px] transition-transform hover:scale-110 motion-reduce:transition-none ${
            faces ? (value === n ? 'border-ink bg-sun' : 'border-transparent') : `font-display border-ink text-lg ${value === n ? 'bg-sun' : 'bg-white'}`
          }`}
          aria-label={label(n)}
          title={label(n)}
          aria-pressed={value === n}
          onClick={() => (audio.click(), onPick(n))}
        >
          {faces ? <Icon name={faces[i]} size={36} /> : n}
        </button>
      ))}
    </div>
  )
}

function Choices({ question, value, onChange }: { question: Extract<SurveyQuestion, { type: 'single_choice' | 'multiple_choice' }>; value: SurveyResponseValue | undefined; onChange: (v: string | string[]) => void }) {
  const many = question.type === 'multiple_choice'
  const picked = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {question.choices.map((c) => {
        const on = picked.includes(c)
        return (
          <button
            key={c}
            className={`btn ${on ? 'btn-blue' : 'btn-cream'} min-h-11 px-3 py-1 text-base`}
            aria-pressed={on}
            onClick={() => (audio.click(), onChange(many ? (on ? picked.filter((p) => p !== c) : [...picked, c]) : c))}
          >
            {c}
          </button>
        )
      })}
    </div>
  )
}

/** The running river, room and device, so an answer can be read next to the run it's about. */
function context() {
  const app = useApp.getState()
  // The menu's background raft is a session too; it isn't what anyone's writing about.
  const { sessionInfo, session } = app.screen === 'game' ? app : { sessionInfo: null, session: null }
  return {
    course: sessionInfo?.courseId ?? null,
    region: sessionInfo?.roomCode?.slice(0, 2) ?? null,
    mode: session ? (session.kind === 'online' ? 'online' : session.localPlayers.length > 1 ? 'couch' : 'solo') : null,
    protocol: PROTOCOL_VERSION,
    touch: isTouch,
  }
}

interface RunAsk {
  /** The one run this page session asks about. */
  results: RunResults | null
  survey: Survey | null
  submissionId: string
  answers: Answers
  step: number
}

const useRunAsk = create<RunAsk>(() => ({ results: null, survey: null, submissionId: '', answers: {}, step: 0 }))

/**
 * One tap on the results card. Asked at most once a page session, and never on a player's first finish;
 * PostHog's wait period and targeting decide the rest.
 */
export function RunSurvey({ results }: { results: RunResults }) {
  const live = useSurvey(SURVEY_IDS.run)
  const askedAbout = useRunAsk((s) => s.results)
  const held = useRunAsk((s) => s.survey)
  const step = useRunAsk((s) => s.step)
  const watching = useApp((s) => !!s.session?.spectating)
  const finishes = useProgress((s) => Object.values(s.records).reduce((n, r) => n + r.finishes, 0))
  const [text, setText] = useState('')
  const mine = askedAbout === results
  const eligible = askedAbout === null && !!live && !watching && finishes > 1

  useEffect(() => {
    if (!eligible) return
    useRunAsk.setState({ results, survey: live, submissionId: crypto.randomUUID(), answers: {}, step: 0 })
    surveyShown(live)
  }, [eligible, live, results])

  const survey = mine ? held : eligible ? live : null
  if (!survey) return null
  const questions = questionsOf(survey)
  const q = questions[mine ? step : 0]

  const answer = (value: SurveyResponseValue) => {
    if (!q) return
    const { answers: before, submissionId } = useRunAsk.getState()
    const answers = { ...before, [q.id]: value }
    surveySent(survey, submissionId, answers, step + 1 >= questions.length, { ...context(), deaths: results.deaths, time: Math.round(results.time * 100) / 100, race: results.standings.length > 1 })
    useRunAsk.setState({ answers, step: step + 1 })
    setText('')
  }

  return (
    <div className="mt-3 flex min-h-14 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border-[3px] border-ink bg-white px-3 py-1.5 anim-rise">
      {!q ? (
        <span className="font-display flex items-center gap-2 text-base">
          <Icon name="heart" size={24} /> Thanks! We read every one.
        </span>
      ) : q.type === 'open' ? (
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            audio.click()
            if (text.trim()) answer(text.trim())
          }}
        >
          <input
            className="field min-w-0 flex-1 py-1.5 text-base"
            placeholder={q.question}
            aria-label={q.question}
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="send"
          />
          <button className="btn btn-green flex min-h-11 w-12 shrink-0 items-center justify-center p-0" type="submit" aria-label="Send" title="Send" disabled={!text.trim()}>
            <Icon name="next" size={26} />
          </button>
        </form>
      ) : (
        <>
          <span className="font-display text-center text-base leading-tight">{q.question}</span>
          {q.type === 'rating' ? (
            <Rating question={q} value={undefined} onPick={answer} />
          ) : (
            <Choices question={q} value={undefined} onChange={answer} />
          )}
        </>
      )}
    </div>
  )
}

/** Opens the feedback survey; hidden when there's none to send to. */
export function FeedbackButton({ className = '', label = true }: { className?: string; label?: boolean }) {
  const survey = useSurvey(SURVEY_IDS.feedback)
  const setOverlay = useApp((s) => s.setOverlay)
  if (!survey) return null
  return (
    <button
      className={`btn btn-cream flex items-center justify-center gap-1.5 ${className}`}
      aria-label="Send feedback"
      title="Send feedback"
      onClick={() => (audio.unlock(), audio.click(), setOverlay('feedback'))}
    >
      <Icon name="chat" size={label ? '1.2em' : 28} />
      {label && 'Feedback'}
    </button>
  )
}

export function FeedbackPanel() {
  const live = useSurvey(SURVEY_IDS.feedback)
  const screen = useApp((s) => s.screen)
  const setOverlay = useApp((s) => s.setOverlay)
  // Held from opening, so the survey's own wait period can't pull it away mid-sentence.
  const [survey] = useState(live)
  const [answers, setAnswers] = useState<Answers>({})
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (survey) surveyShown(survey)
  }, [survey])

  const back = () => setOverlay(screen === 'game' ? 'pause' : null)
  if (!survey) return null
  const questions = questionsOf(survey)
  const answered = (q: Question) => {
    const v = answers[q.id]
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null
  }
  const ready = questions.some(answered) && questions.every((q) => q.optional || answered(q))
  const set = (q: Question) => (v: SurveyResponseValue) => setAnswers((a) => ({ ...a, [q.id]: v }))

  const send = () => {
    audio.click()
    const clean = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))
    surveySent(survey, crypto.randomUUID(), clean, true, { ...context(), screen })
    setSent(true)
  }

  if (sent) {
    return (
      <Modal onClose={back} width={420} shortWidth={480}>
        <div className="text-center">
          <Icon name="heart" size={64} className="anim-wobble" />
          <div className="font-display text-4xl short:text-3xl">THANKS!</div>
          <p className="mt-1 text-sm font-extrabold text-ink/60">We read every one.</p>
        </div>
        <button className="btn btn-green mt-5 w-full text-2xl short:mt-3 short:py-2" onClick={() => (audio.click(), back())}>
          {screen === 'game' ? 'Back to the river' : 'Back'}
        </button>
      </Modal>
    )
  }

  return (
    <Modal
      onClose={back}
      width={480}
      shortWidth={620}
      footer={
        <div className="flex gap-3 short:[&_.btn]:py-2">
          <button className="btn btn-cream flex-1 text-xl" onClick={() => (audio.click(), back())}>
            Cancel
          </button>
          <button className="btn btn-green flex flex-[2] items-center justify-center gap-2 text-xl" disabled={!ready} onClick={send}>
            Send <Icon name="next" size="1.1em" />
          </button>
        </div>
      }
    >
      <div className="font-display flex items-center justify-center gap-2 text-4xl short:text-3xl">
        <Icon name="chat" size="0.9em" /> FEEDBACK
      </div>
      {survey.description && <p className="mt-1 text-center text-sm font-extrabold text-ink/60">{survey.description}</p>}
      <div className="mt-4 flex flex-col gap-4 short:mt-2 short:gap-3">
        {questions.map((q) => (
          <div key={q.id} className="flex flex-col gap-2">
            <span className="font-display text-center text-lg leading-tight short:text-base">{q.question}</span>
            {q.type === 'rating' ? (
              <Rating question={q} value={answers[q.id]} onPick={set(q)} />
            ) : q.type === 'open' ? (
              <textarea
                className="field min-h-24 resize-none text-base short:min-h-16"
                aria-label={q.question}
                value={(answers[q.id] as string | undefined) ?? ''}
                maxLength={2000}
                onChange={(e) => set(q)(e.target.value)}
              />
            ) : (
              <Choices question={q} value={answers[q.id]} onChange={set(q)} />
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
