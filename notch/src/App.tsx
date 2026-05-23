import { useEffect, useState } from 'react'
import type { NotchStatePayload } from './types'
import { PreCall } from './phases/PreCall'
import { LiveCall } from './phases/LiveCall'
import { PostCall } from './phases/PostCall'
import { SearchPanel } from './components/SearchPanel'
import { PanelHeader } from './components/PanelHeader'
import { DemoControls } from './components/DemoControls'

export default function App() {
  const [state, setState] = useState<NotchStatePayload | null>(null)

  useEffect(() => {
    void window.notch.getState().then(setState)
    return window.notch.onState(setState)
  }, [])

  if (!state) {
    return (
      <div className="panel flex items-center justify-center">
        <span className="text-sm text-white/35">Loading…</span>
      </div>
    )
  }

  return (
    <div className="panel">
      <PanelHeader phase={state.phase} callActive={state.callActive} simulationMode={state.simulationMode} />
      <div className="panel-scroll">
        {state.phase === 'pre_call' && state.prep && <PreCall prep={state.prep} />}
        {state.phase === 'live_call' && state.prep && (
          <LiveCall prep={state.prep} live={state.live} onTogglePoint={window.notch.togglePoint} />
        )}
        {state.phase === 'post_call' && state.postCall && <PostCall summary={state.postCall} />}
        {state.phase === 'idle' && (
          <p className="text-sm text-white/35">Waiting for calendar event…</p>
        )}
      </div>
      {state.searchOpen && <SearchPanel onClose={window.notch.closeSearch} />}
      <DemoControls
        phase={state.phase}
        onStart={window.notch.startCall}
        onEnd={window.notch.endCall}
        onPrep={window.notch.loadPreCall}
      />
    </div>
  )
}
