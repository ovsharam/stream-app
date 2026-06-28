'use client'

import { useId } from 'react'
import type React from 'react'

// Exact port of the LightOrb SVG from micro.reformcollective.com
// Uses useId() to generate unique filter/gradient IDs so multiple orbs
// can coexist on the same page without SVG ID conflicts.

export function LightOrb({
  size = 200,
  opacity = 0.5,
  style,
}: {
  size?: number
  opacity?: number
  style?: React.CSSProperties
}) {
  const uid = useId().replace(/:/g, '')
  const fa = `a${uid}`, fe = `e${uid}`, ff = `f${uid}`
  const gb = `b${uid}`, gc = `c${uid}`, md = `d${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 201 201"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: 'block', pointerEvents: 'none', ...style }}
    >
      <defs>
        <filter id={fa} width="291.824" height="291.825" x="-29.186" y="-10.095"
          colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feFlood floodOpacity="0" result="BackgroundImageFix"/>
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feGaussianBlur result="effect1" stdDeviation="26.364"/>
        </filter>
        <filter id={fe} width="157.276" height="157.276" x="-6.452" y="-4.185"
          colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feFlood floodOpacity="0" result="BackgroundImageFix"/>
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feGaussianBlur result="effect1" stdDeviation="17.273"/>
        </filter>
        <filter id={ff} width="243.53" height="251.787" x="-15.546" y="-0.058"
          colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feFlood floodOpacity="0" result="BackgroundImageFix"/>
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feGaussianBlur result="effect1" stdDeviation="17.273"/>
        </filter>
        <linearGradient id={gb} x1="78.303" x2="230.626" y1="59.712" y2="184.567"
          gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAEAEA"/>
          <stop offset="1" stopColor="#969696"/>
        </linearGradient>
        <linearGradient id={gc} x1="78.305" x2="230.628" y1="59.712" y2="184.567"
          gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAEAEA"/>
          <stop offset="1" stopColor="#C4C4C4"/>
        </linearGradient>
      </defs>

      {/* Drop shadow */}
      <g filter={`url(#${fa})`}>
        <circle cx="116.727" cy="135.818" r="93.184" fill="black" fillOpacity="0.15"/>
      </g>

      {/* Main sphere */}
      <circle cx="100.817" cy="100.817" r="100.002"
        fill={`url(#${gb})`} fillOpacity={opacity}/>

      {/* Highlight mask */}
      <mask id={md} maskUnits="userSpaceOnUse">
        <circle cx="100.819" cy="100.817" r="100.002" fill={`url(#${gc})`}/>
      </mask>
      <g mask={`url(#${md})`}>
        {/* Inner specular highlight */}
        <g filter={`url(#${fe})`}>
          <circle cx="72.186" cy="74.453" r="44.092" fill="white"/>
        </g>
        {/* Rim light */}
        <g filter={`url(#${ff})`}>
          <path fill="white" fillRule="evenodd" clipRule="evenodd"
            d="M75.2529 201.273C130.483 201.273 175.255 156.501 175.255 101.271C175.255 75.603 165.585 52.1938 149.689 34.4878C176.098 52.4881 193.438 82.8091 193.438 117.18C193.438 172.41 148.665 217.182 93.4356 217.182C63.8737 217.182 37.3078 204.355 19 183.963C35.027 194.887 54.3942 201.273 75.2529 201.273Z"/>
        </g>
      </g>
    </svg>
  )
}
