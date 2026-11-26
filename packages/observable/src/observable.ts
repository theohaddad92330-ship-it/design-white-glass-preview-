export type Observable<T> = {
  getValue(): T
  subscribe(subscriber: (value: T) => void): () => void
}

export type Subscribable<T> = Observable<T> & {
  setValue(newValueOrFunction: T | ((value: T) => T)): void
}

export function newSubscribable<T>(initialValue: T): Subscribable<T> {
  let value = initialValue
  let subscribers = new Array<(value: T) => void>()

  return {
    getValue(): T {
      return value
    },
    setValue(newValueOrFunction: T | ((value: T) => T)) {
      const newValue =
        typeof newValueOrFunction === 'function' ? (newValueOrFunction as (value: T) => T)(value) : newValueOrFunction

      if (value === newValue) return

      value = newValue
      subscribers.forEach(s => s(newValue))
    },
    subscribe(subscriber: (value: T) => void): () => void {
      subscribers.push(subscriber)
      return () => {
        subscribers = subscribers.filter(s => s !== subscriber)
      }
    },
  }
}
