export function onboardingSubmitSucceeded(response: Response): boolean {
  if (response.ok) {
    return true;
  }

  if (response.status === 303) {
    return true;
  }

  return response.type === "opaqueredirect";
}
