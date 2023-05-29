export default function waitFor(
  fn: () => boolean,
  interval = 100,
  timeout = 30000
) {
  return new Promise<void>((resolve, reject) => {
    const intervalFn = setInterval(() => {
      if (fn()) {
        clearInterval(intervalFn);
        clearTimeout(timeoutFn);
        resolve();
      }
    }, interval);

    const timeoutFn = setTimeout(() => {
      clearInterval(intervalFn);
      reject();
    }, timeout);
  });
}
