'use client'

import { useEffect, useState } from 'react'
import { clusterApi } from '@/lib/cluster-api'
import { useCentralStream } from '@/hooks/useCentralStream'
import { CentralHeader } from '@/components/central/CentralHeader'
import { CentralStream } from '@/components/central/CentralStream'
import { CentralComposer } from '@/components/central/CentralComposer'

export default function CentralClusterPage() {
  const { events, live } = useCentralStream()
  const [deal, setDeal] = useState('Acme Corp')

  useEffect(() => {
    void clusterApi.context().then((c) => setDeal(c.activeDeal.company))
  }, [])

  return (
    <>
      <CentralHeader live={live} deal={deal} />
      <CentralStream events={events} live={live} />
      <CentralComposer />
    </>
  )
}
