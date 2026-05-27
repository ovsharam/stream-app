import type { GuideQuestion } from '@shared/mobile'

export function GuideQuestions({ questions }: { questions: GuideQuestion[] }) {
  if (!questions.length) return null
  return (
    <div className="guide-questions">
      <div className="gq-label">Guide the conversation to:</div>
      {questions.map((q, i) => (
        <div key={i} className={`gq-item ${q.urgent ? 'gq-urgent' : ''}`}>
          <span className="gq-num">{i + 1}</span>
          <div className="gq-content">
            <span className="gq-text">{q.text}</span>
            {q.why && <span className="gq-why">{q.why}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
