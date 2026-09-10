import { useQuery } from '@tanstack/react-query';
import { useDomain } from '@/src/db/domain';
import { getSettings, updateSettings, type SettingsPatch } from '@/src/domain/settings';
import { onSettingsChange, ROOT_KEY, useDomainMutation } from '../queries';

export function useSettings() {
  const ctx = useDomain();
  return useQuery({ queryKey: [...ROOT_KEY, 'settings'], queryFn: () => getSettings(ctx) });
}

export function useSettingsActions() {
  const ctx = useDomain();
  const update = useDomainMutation((patch: SettingsPatch) => {
    const row = updateSettings(ctx, patch);
    onSettingsChange.forEach((fn) => fn()); // DomainProvider rebuilds the ctx with the new settings
    return row;
  });
  return { update };
}
