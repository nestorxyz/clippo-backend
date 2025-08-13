import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

interface LemonWebhookMeta {
  event_name: string;
  custom_data?: { phone_number?: string };
}
interface LemonWebhookEnvelope {
  meta: LemonWebhookMeta;
  data: any;
}

function timingSafeCompare(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post('/lemon', async (req: Request, res: Response) => {
  try {
    const rawBody: Buffer = req.body as any; // express.raw added before this route
    const rawString = rawBody.toString('utf8');
    const signatureHeader = req.get('X-Signature') || '';
    const secret = process.env.LEMON_WEBHOOK_SIGNING_SECRET || '';
    const digest = crypto
      .createHmac('sha256', secret)
      .update(rawString)
      .digest('hex');
    const valid = timingSafeCompare(
      Buffer.from(digest, 'utf8'),
      Buffer.from(signatureHeader, 'utf8')
    );

    let parsed: LemonWebhookEnvelope;
    try {
      parsed = JSON.parse(rawString);
    } catch {
      throw new Error('Invalid JSON');
    }
    const eventName = parsed.meta?.event_name;
    const dataObj = parsed.data;
    const lemonId = dataObj?.id;
    const objectType = dataObj?.type;
    const eventKey = `${eventName}:${objectType}:${lemonId}`;

    const { error: auditError } = await supabaseAdmin
      .from('subscription_webhook_events')
      .insert({
        event_name: eventName,
        lemon_object_type: objectType,
        lemon_object_id: lemonId,
        event_key: eventKey,
        raw_payload: parsed as any,
        signature: signatureHeader,
        duplicate: false,
      });
    if (auditError && auditError.message.includes('duplicate key')) {
      return res.json({ success: true, duplicate: true });
    } else if (auditError) {
      console.error('Audit insert error', auditError);
    }

    if (!valid)
      return res
        .status(400)
        .json({ success: false, error: 'INVALID_SIGNATURE' });
    if (!eventName) throw new Error('Missing event_name');
    if (!objectType) throw new Error('Missing object type');
    if (objectType !== 'subscriptions')
      return res.json({
        success: true,
        message: 'Ignored non-subscription object',
      });

    const attr = dataObj.attributes || {};
    const status: string = attr.status;
    const renews_at: string = attr.renews_at;
    const ends_at: string | null = attr.ends_at || null;
    const product_id = attr.product_id ? String(attr.product_id) : null;
    const variant_id = attr.variant_id ? String(attr.variant_id) : null;
    const customer_id = attr.customer_id ? String(attr.customer_id) : null;
    const trial_ends_at: string | null = attr.trial_ends_at || null;
    const card_brand: string | null = attr.card_brand || null;
    const card_last_four: string | null = attr.card_last_four || null;
    const update_payment_method_url: string | null =
      attr.urls?.update_payment_method || null;
    const customer_portal_url: string | null =
      attr.urls?.customer_portal || null;
    const user_email: string | null = attr.user_email || null;

    let userId: string | null = null;
    if (user_email) {
      try {
        const { data: list } = await (
          supabaseAdmin as any
        ).auth.admin.listUsers?.({ email: user_email });
        const found = list?.users?.find(
          (u: any) => u.email?.toLowerCase() === user_email.toLowerCase()
        );
        if (found) userId = found.id;
      } catch (e) {
        console.warn('Failed to list users by email', e);
      }
    }

    if (!userId) {
      console.error('Subscription webhook user not found by email', user_email);
      return res.status(400).json({ success: false, error: 'USER_NOT_FOUND' });
    }

    const { data: existing } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('lemon_subscription_id', lemonId)
      .maybeSingle();
    const payload: any = {
      user_id: userId,
      lemon_subscription_id: lemonId,
      product_id,
      variant_id,
      customer_id,
      status,
      trial_ends_at,
      renews_at,
      ends_at,
      card_brand,
      card_last_four,
      update_payment_method_url,
      customer_portal_url,
    };
    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update(payload)
        .eq('lemon_subscription_id', lemonId);
      if (updateError) console.error('Update subscription error', updateError);
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('subscriptions')
        .insert(payload);
      if (insertError) console.error('Insert subscription error', insertError);
    }
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Lemon webhook error', err);
    return res
      .status(500)
      .json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

export default router;
