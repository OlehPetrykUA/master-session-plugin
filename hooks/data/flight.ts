export function skipWhileBusy(run: () => Promise<unknown>) {
  let isBusy = false
  return () => {
    if (isBusy) return
    isBusy = true
    void run()
      .catch(() => undefined)
      .finally(() => {
        isBusy = false
      })
  }
}
