import type { CaptureOptions, PostHog, Survey, SurveyResponseValue } from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY
/** API surveys made in PostHog: we draw them, PostHog picks who sees them and keeps the answers. */
export const SURVEY_IDS = {
  run: import.meta.env.VITE_POSTHOG_RUN_SURVEY as string | undefined,
  feedback: import.meta.env.VITE_POSTHOG_FEEDBACK_SURVEY as string | undefined,
}

let enabled = false
let client: PostHog | null = null
let playerName: string | null = null
let surveys: Survey[] = []
const surveyListeners = new Set<() => void>()
/** What happened before PostHog finished loading, sent once it has. */
const queue: ((posthog: PostHog) => void)[] = []

export function initAnalytics() {
  if (!import.meta.env.PROD || !POSTHOG_KEY) return
  enabled = true
  const load = () =>
    import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(POSTHOG_KEY, {
          // Proxied through the page's own origin (vercel.json) so ad blockers don't drop events.
          api_host: '/splash',
          ui_host: 'https://us.posthog.com',
          defaults: '2026-08-30',
          person_profiles: 'always',
          disable_session_recording: true,
          // Uncaught errors and rejected promises, into PostHog's error tracking.
          capture_exceptions: true,
        })
        client = posthog
        if (playerName) posthog.setPersonProperties({ name: playerName })
        posthog.onActiveMatchingSurveysChanged((active) => {
          surveys = active.filter((s) => s.type === 'api')
          for (const fn of surveyListeners) fn()
        })
        for (const send of queue.splice(0)) send(posthog)
      })
      .catch(() => {
        enabled = false
        queue.length = 0
      })
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 3000 })
  else setTimeout(load, 1500)
}

export function setPlayerName(name: string) {
  if (!enabled || name === playerName) return
  playerName = name
  client?.setPersonProperties({ name })
}

export function track(event: string, properties?: Record<string, unknown>, options?: CaptureOptions) {
  if (!enabled) return
  if (client) client.capture(event, properties, options)
  else queue.push((posthog) => posthog.capture(event, properties, options))
}

/** An error the game caught itself (the crash screen), which PostHog's own capture never sees. */
export function reportError(error: unknown) {
  if (!enabled) return
  if (client) client.captureException(error)
  else queue.push((posthog) => posthog.captureException(error))
}

export function subscribeSurveys(fn: () => void) {
  surveyListeners.add(fn)
  return () => void surveyListeners.delete(fn)
}

/** The survey if it's running and this player matches its targeting (and wait period) right now. */
export function activeSurvey(id: string | undefined) {
  return (id && surveys.find((s) => s.id === id)) || null
}

const surveyProps = (survey: Survey) => ({
  $survey_id: survey.id,
  $survey_name: survey.name,
  $survey_iteration: survey.current_iteration,
  $survey_iteration_start_date: survey.current_iteration_start_date,
})

export function surveyShown(survey: Survey) {
  track('survey shown', surveyProps(survey))
  // Starts the survey's wait period, as PostHog's own renderer would.
  client?.surveys.markSurveyAsSeen(survey.id, { iteration: survey.current_iteration ?? undefined })
}

/** Answers keyed by question id. Sending again with the same submission id updates the answer. */
export function surveySent(
  survey: Survey,
  submissionId: string,
  answers: Record<string, SurveyResponseValue>,
  completed: boolean,
  properties?: Record<string, unknown>,
) {
  const responses: Record<string, unknown> = {}
  survey.questions.forEach((q, i) => {
    if (!q.id || answers[q.id] === undefined) return
    responses[`$survey_response_${q.id}`] = answers[q.id]
    // The old index keys, which some of PostHog's survey views still read.
    responses[i === 0 ? '$survey_response' : `$survey_response_${i}`] = answers[q.id]
  })
  track('survey sent', {
    ...surveyProps(survey),
    $survey_submission_id: submissionId,
    $survey_completed: completed,
    $survey_questions: survey.questions.map((q) => ({ id: q.id, question: q.question, response: q.id ? answers[q.id] : undefined })),
    ...responses,
    ...properties,
    $set: { [`$survey_responded/${survey.id}${survey.current_iteration ? `/${survey.current_iteration}` : ''}`]: true },
  })
}
