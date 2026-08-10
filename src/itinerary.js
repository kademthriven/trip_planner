const atTime = (dateString, hour, minute = 0) => {
  const date = new Date(`${dateString}T12:00:00`)
  date.setHours(hour, minute, 0, 0)
  return date
}

const readableTime = (date) => date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000)

const selectedDeparture = (dateString, timeLabel) => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(timeLabel || '')
  if (!match) return null
  let hour = Number(match[1]) % 12
  if (match[3].toUpperCase() === 'PM') hour += 12
  return atTime(dateString, hour, Number(match[2]))
}

export const generateItinerary = ({ start, end, route, weather, places, settings, departureDate, departureTime, returnDate, variation = 0 }) => {
  const planned = places.filter((place) => place.planned)
  const byCategory = (category) => {
    const matches = [...planned.filter((place) => place.category === category), ...places.filter((place) => place.category === category && !place.planned)]
    return matches[variation % Math.max(1, matches.length)]
  }
  const food = byCategory('food')
  const stay = byCategory('stay')
  const sight = byCategory('attraction')
  const fuel = byCategory('fuel')
  const sunrise = weather?.sunrise ? new Date(weather.sunrise) : atTime(departureDate, 6, 15)
  const arrivalTarget = addMinutes(sunrise, -15)
  const depart = selectedDeparture(departureDate, departureTime) || addMinutes(arrivalTarget, -(route?.durationMinutes || 90))
  const prep = addMinutes(depart, -30)
  const arrival = addMinutes(depart, route?.durationMinutes || 90)
  const dayOne = {
    date: departureDate,
    title: `Ride to ${end.name}`,
    weather: weather ? `${weather.label} · ${weather.min}–${weather.max}° · ${weather.rain}% rain` : 'Check forecast before departure',
    items: [
      { time: readableTime(prep), type: 'prep', title: 'Pre-ride safety check', detail: `Tyres, brakes, lights, documents and ${settings.bikeName || 'bike'} fuel range.` },
      { time: readableTime(depart), type: 'ride', title: `Depart ${start.name}`, detail: `${route.distanceKm.toFixed(0)} km via ${route.road} · ${route.name}.` },
      fuel && { time: readableTime(addMinutes(depart, Math.min(45, route.durationMinutes * .42))), type: 'fuel', title: `Fuel stop · ${fuel.name}`, detail: `Trip petrol allocation ₹${Math.round((route.distanceKm * (settings.roundTrip ? 2 : 1) / settings.mileage) * settings.fuelPrice)}.` },
      { time: readableTime(arrival), type: 'view', title: `Arrive at ${end.name}`, detail: weather?.sunrise ? `Settle in before the ${readableTime(sunrise)} sunrise.` : 'Take a short break and enjoy the first view.' },
      food && { time: readableTime(addMinutes(arrival, 75)), type: 'food', title: `Breakfast · ${food.name}`, detail: food.estimate ? `Allow about ₹${food.estimate} per person.` : 'Confirm opening hours on arrival.' },
      sight && { time: '10:30 AM', type: 'sight', title: `Explore · ${sight.name}`, detail: `${sight.type.replaceAll('_', ' ')} near your destination.` },
      settings.nights > 0 && stay && { time: '2:00 PM', type: 'stay', title: `Check in · ${stay.name}`, detail: `Planning estimate ₹${stay.estimate || settings.stayPerNight} per night.` },
      { time: '5:40 PM', type: 'weather', title: weather?.rain > 55 ? 'Indoor backup / early return' : 'Golden-hour viewpoint', detail: weather?.rain > 55 ? 'Rain risk is high—avoid exposed roads after dark.' : 'Allow time to park before sunset.' },
    ].filter(Boolean),
  }
  const days = [dayOne]
  for (let night = 1; night < settings.nights; night += 1) {
    const date = new Date(`${departureDate}T12:00:00`); date.setDate(date.getDate() + night)
    days.push({ date: date.toISOString().slice(0, 10), title: `Explore ${end.name}`, weather: 'Check the refreshed forecast', items: [{ time: '8:00 AM', type: 'food', title: 'Local breakfast', detail: food?.name || 'Choose a well-rated local café.' }, { time: '10:00 AM', type: 'sight', title: sight ? `Visit ${sight.name}` : 'Explore nearby highlights', detail: 'Keep the afternoon flexible for weather and road conditions.' }, { time: '6:00 PM', type: 'prep', title: 'Prepare for return', detail: 'Refuel, charge devices and inspect the motorcycle.' }] })
  }
  if (settings.roundTrip) days.push({ date: returnDate, title: `Return to ${start.name}`, weather: 'Leave after checking the latest road forecast', items: [{ time: '7:30 AM', type: 'prep', title: 'Check out and inspect bike', detail: 'Secure luggage and check fuel range.' }, { time: '8:00 AM', type: 'ride', title: `Ride back to ${start.name}`, detail: `${route.distanceKm.toFixed(0)} km · allow ${Math.ceil(route.durationMinutes / 15) * 15} minutes plus stops.` }, { time: readableTime(addMinutes(atTime(returnDate, 8), route.durationMinutes)), type: 'finish', title: 'Trip complete', detail: 'Log final spend and save your favourite stops for the next ride.' }] })
  return { title: `${start.name} to ${end.name}`, generatedAt: new Date().toISOString(), days, selectedStops: [fuel, food, sight, stay].filter(Boolean).map((place) => place.id) }
}
