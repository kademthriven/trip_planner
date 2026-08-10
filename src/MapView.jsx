import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const pinLabel = {
  fuel: '⛽', food: '●', stay: '▣', attraction: '✦', service: '⚙', hospital: '+', start: '↗', end: '●', current: '◎',
}

const makeMarker = ({ type, title, subtitle, onClick }) => {
  const root = document.createElement('button')
  root.type = 'button'
  root.className = `live-map-marker marker-${type}`
  root.setAttribute('aria-label', title)
  const pin = document.createElement('span')
  pin.className = 'live-pin'
  pin.textContent = pinLabel[type] || '•'
  root.appendChild(pin)
  if (title) {
    const label = document.createElement('span')
    label.className = 'live-marker-label'
    const strong = document.createElement('strong')
    strong.textContent = title
    label.appendChild(strong)
    if (subtitle) {
      const small = document.createElement('small')
      small.textContent = subtitle
      label.appendChild(small)
    }
    root.appendChild(label)
  }
  if (onClick) root.addEventListener('click', onClick)
  return root
}

const mapStyle = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'base-background', type: 'background', paint: { 'background-color': '#18231b' } },
    { id: 'osm-raster', type: 'raster', source: 'osm', paint: { 'raster-saturation': -.55, 'raster-brightness-max': .62, 'raster-contrast': .16 } },
  ],
}

const MapView = forwardRef(function MapView({ start, end, routes, selectedId, places, visibleCategories, currentPosition, onPlaceSelect }, ref) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const routeStateRef = useRef({ routes, selectedId })
  const drawRoutesRef = useRef(null)
  routeStateRef.current = { routes, selectedId }

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    recenter: () => {
      const map = mapRef.current
      if (!map || !start || !end) return
      const bounds = new maplibregl.LngLatBounds([start.lon, start.lat], [start.lon, start.lat])
      bounds.extend([end.lon, end.lat])
      map.fitBounds(bounds, { padding: { top: 100, right: 100, bottom: 155, left: 100 }, pitch: 48, duration: 900 })
    },
    togglePitch: () => {
      const map = mapRef.current
      if (map) map.easeTo({ pitch: map.getPitch() > 10 ? 0 : 48, bearing: map.getPitch() > 10 ? 0 : -18, duration: 700 })
    },
    followPosition: (position) => {
      const map = mapRef.current
      if (!map || !position) return
      map.easeTo({
        center: [position.lon, position.lat],
        zoom: Math.max(map.getZoom(), 16),
        pitch: 58,
        bearing: Number.isFinite(position.heading) ? position.heading : map.getBearing(),
        duration: 850,
      })
    },
  }), [start, end])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [77.64, 13.16],
      zoom: 9.7,
      pitch: 48,
      bearing: -18,
      attributionControl: false,
      antialias: true,
      maxPitch: 70,
    })
    map.dragRotate.enable()
    map.touchZoomRotate.enableRotation()
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)
    window.setTimeout(() => map.resize(), 0)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.classList.add('projected-routes')
    containerRef.current.appendChild(svg)
    const drawRoutes = () => {
      const routeState = routeStateRef.current
      const ordered = [...routeState.routes].sort((a, b) => Number(a.id === routeState.selectedId) - Number(b.id === routeState.selectedId))
      const needed = ordered.length * 2
      while (svg.children.length < needed) svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'))
      while (svg.children.length > needed) svg.lastChild.remove()
      ordered.forEach((route, index) => {
        const coordinates = route.sampledCoordinates || route.geometry?.coordinates || []
        const d = coordinates.map((coordinate, pointIndex) => {
          const point = map.project(coordinate)
          return `${pointIndex ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`
        }).join(' ')
        const selected = route.id === routeState.selectedId
        const casing = svg.children[index * 2]
        const line = svg.children[index * 2 + 1]
        casing.setAttribute('d', d)
        casing.setAttribute('class', `projected-route-casing ${selected ? 'selected' : ''}`)
        line.setAttribute('d', d)
        line.setAttribute('class', `projected-route-line ${selected ? 'selected' : ''}`)
        line.setAttribute('stroke', route.color || '#e7fe52')
      })
    }
    drawRoutesRef.current = drawRoutes
    map.on('render', drawRoutes)
    map.on('move', drawRoutes)
    mapRef.current = map
    return () => {
      resizeObserver.disconnect()
      map.off('render', drawRoutes)
      map.off('move', drawRoutes)
      svg.remove()
      map.remove()
      mapRef.current = null
      drawRoutesRef.current = null
    }
  }, [])

  useEffect(() => {
    drawRoutesRef.current?.()
  }, [routes, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !start || !end) return
    const bounds = new maplibregl.LngLatBounds([start.lon, start.lat], [start.lon, start.lat])
    bounds.extend([end.lon, end.lat])
    routes.forEach((route) => route.geometry?.coordinates?.forEach((coordinate) => bounds.extend(coordinate)))
    map.fitBounds(bounds, { padding: { top: 90, right: 100, bottom: 145, left: 90 }, pitch: 48, bearing: -18, duration: 1000, maxZoom: 13 })
  }, [start, end, routes])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []
    const add = (place, type, title, subtitle, click) => {
      if (!Number.isFinite(place?.lon) || !Number.isFinite(place?.lat)) return
      const marker = new maplibregl.Marker({ element: makeMarker({ type, title, subtitle, onClick: click }), anchor: 'bottom-left' })
        .setLngLat([place.lon, place.lat]).addTo(map)
      markersRef.current.push(marker)
    }
    add(start, 'start', start.name, 'Ride starts here')
    add(end, 'end', end.name, 'Your destination')
    places.filter((place) => visibleCategories.has(place.category)).slice(0, 16).forEach((place) => {
      add(place, place.category, place.name, place.estimate ? `Est. ₹${place.estimate}` : place.type, () => onPlaceSelect?.(place))
    })
    if (currentPosition) add(currentPosition, 'current', 'You are here', 'Live location')
  }, [start, end, places, visibleCategories, currentPosition, onPlaceSelect])

  return <div className="live-map" ref={containerRef} />
})

export default MapView
