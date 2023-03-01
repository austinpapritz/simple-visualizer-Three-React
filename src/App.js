import * as THREE from 'three'
import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { suspend } from 'suspend-react'
import * as Tone from 'tone'

export default function App(props) {
  function logData() {
    console.log('data', data)
  }
  return (
    <>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [-1, 1.5, 2], fov: 25 }}>
        <spotLight position={[-4, 4, -4]} angle={0.06} penumbra={1} castShadow shadow-mapSize={[2048, 2048]} />
        {/* Suspense handles timing of the mp3s to start at same time */}
        <Suspense fallback={null}>
          <Track position-z={-0.3} />
          {/* <Track position-z={-0.1} url="" />
        <Track position-z={0.1} url="" />
        <Track position-z={0.3} url="" /> */}
          {/* <Zoom url="" /> */}
        </Suspense>
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]}>
          <planeGeometry />
          <shadowMaterial transparent opacity={0.15} />
        </mesh>
      </Canvas>
      <button onClick={() => logData()}>Log to console</button>
    </>
  )
}

function Track({ url, y = 2500, space = 2.0, width = 0.01, height = 0.09, obj = new THREE.Object3D(), ...props }) {
  const ref = useRef()
  // suspend-react is the library that r3f uses internally for useLoader. It caches promises and
  // integrates them with React suspense. You can use it as-is with or without r3f.

  const sineLevel = new Tone.Volume(-30).toDestination()
  let waveform = new Tone.Waveform()
  Tone.Destination.connect(waveform)
  playingSynth.current = true

  const sineLfo = new Tone.Tremolo({
    frequency: 0,
    depth: 1,
    spread: 0,
  }).connect(sineLevel)

  const sine = new Tone.MonoSynth({
    volume: -8,
    oscillator: {
      type: 'sine',
      frequency: 150,
    },
    envelope: {
      attack: 0.6,
      decay: 0.0,
      sustain: 1,
      release: 0.1,
    },
  }).connect(sineLfo)

  const waveformValue = waveform.getValue(0)
  console.log('waveformValue', waveformValue)

  const { gain, context, update, data } = suspend(() => createAudio(waveformValue), [waveformValue])
  useEffect(() => {
    // Connect the gain node, which plays the audio
    gain.connect(context.destination)
    // Disconnect it on unmount
    return () => gain.disconnect()
  }, [gain, context])

  useFrame((state) => {
    let avg = update()
    // Distribute the instanced planes according to the frequency data
    for (let i = 0; i < data.length; i++) {
      obj.position.set(i * width * space - (data.length * width * space) / 2, data[i] / y, 0)
      obj.updateMatrix()
      ref.current.setMatrixAt(i, obj.matrix)
    }
    // Set the hue according to the frequency average
    ref.current.material.color.setHSL(avg / 500, 0.75, 0.75)
    ref.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh castShadow ref={ref} args={[null, null, data.length]} {...props}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

// function Zoom({ url }) {
//   // This will *not* re-create a new audio source, suspense is always cached,
//   // so this will just access (or create and then cache) the source according to the url
//   const { data } = suspend(() => createAudio(url), [url])
//   return useFrame((state) => {
//     // Set the cameras field of view according to the frequency average
//     // this zooms in/out on the beat
//     state.camera.fov = 25 - data.avg / 12
//     state.camera.updateProjectionMatrix()
//   })
// }

async function createAudio(url) {
  // Fetch audio data and create a buffer source
  const res = await fetch(url)
  const buffer = await res.arrayBuffer()
  const context = new (window.AudioContext || window.webkitAudioContext)()
  const source = context.createBufferSource()
  source.buffer = await new Promise((res) => context.decodeAudioData(buffer, res))
  console.log('source.buffer', source.buffer)
  source.loop = true
  // This is why it doesn't run in Safari 🍏🐛. Start has to be called in an onClick event
  // which makes it too awkward for a little demo since you need to load the async data first
  source.start(0)
  // Create gain node and an analyser
  const gain = context.createGain()
  const analyser = context.createAnalyser()
  analyser.fftSize = 32
  source.connect(analyser)
  analyser.connect(gain)
  // The data array receive the audio frequencies
  const data = new Uint8Array(analyser.frequencyBinCount)

  return {
    context,
    source,
    gain,
    data,
    // This function gets called every frame per audio source
    update: () => {
      analyser.getByteFrequencyData(data)
      // Calculate a frequency average
      return (data.avg = data.reduce((prev, cur) => prev + cur / data.length, 0))
    },
  }
}
