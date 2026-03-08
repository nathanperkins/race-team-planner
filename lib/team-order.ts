export function replaceTeamIdInOrder(
  order: string[],
  currentTeamId: string,
  nextTeamId: string
): string[] {
  if (order.length === 0) return order
  const currentIndex = order.indexOf(currentTeamId)
  if (currentIndex === -1) return order

  const next = [...order]
  next[currentIndex] = nextTeamId

  // Keep the edited tile in its current position while removing any duplicate
  // replacement team IDs from elsewhere in the order.
  return next.filter((id, index) => id !== nextTeamId || index === currentIndex)
}
