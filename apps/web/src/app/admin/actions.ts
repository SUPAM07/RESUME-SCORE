// Key fixes for getUserDetailsById function - integrate into existing file

import { createServiceClient } from '@/utils/supabase/service-client';

export async function getUserDetailsById(userId: string) {
  // Validate input
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('Valid User ID is required');
  }

  const supabase = await createServiceClient();

  try {
    // 1. Fetch User Auth Info
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    if (userError) {
      if (userError.status === 404 || userError.message.includes('not found')) {
        return null; // User doesn't exist
      }
      console.error(`Error fetching user auth info for ${userId}:`, userError);
      throw new Error(`Failed to fetch user auth info: ${userError.message}`);
    }
    
    if (!userData?.user) {
      throw new Error(`No user found with ID ${userId}`);
    }
    
    const user = userData.user;

    // 2. Fetch Profile (may not exist)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') { // 116 = no rows
      console.error(`Error fetching profile for ${userId}:`, profileError);
      // Don't fail entirely—profile is optional
    }

    // 3. Fetch Subscription (may not exist)
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (subscriptionError && subscriptionError.code !== 'PGRST116') {
      console.error(`Error fetching subscription for ${userId}:`, subscriptionError);
      // Don't fail entirely—subscription is optional
    }

    // 4. Fetch resume count
    const { data: resumeCountData, error: resumeCountError } = await supabase.rpc(
      'get_resume_count',
      { user_id_arg: userId }
    );

    if (resumeCountError) {
      console.error(`Error fetching resume count for ${userId}:`, resumeCountError);
    }

    return {
      user,
      profile: profile || null,
      subscription: subscription || null,
      resume_count: (resumeCountData as any)?.[0]?.resume_count || 0,
    };
  } catch (err) {
    console.error(`Unexpected error in getUserDetailsById for ${userId}:`, err);
    throw err;
  }
}