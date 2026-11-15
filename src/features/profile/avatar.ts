import { supabase } from '../../lib/supabase'

/**
 * Upload a profile photo to the private-per-user "avatars" storage folder.
 * Overwrites the same object and busts the CDN cache with a version query.
 */
export async function uploadAvatar(uid: string, file: File): Promise<string> {
  const path = `${uid}/avatar.png`
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
