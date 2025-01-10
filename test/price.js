function maxPrice(request) {
  return (
    request.ask.slots *
    request.ask.duration *
    request.ask.pricePerByte *
    request.ask.slotSize
  )
}

function payoutForDuration(request, start, end) {
  return (end - start) * request.ask.pricePerByte * request.ask.slotSize
}

module.exports = { maxPrice, payoutForDuration }
