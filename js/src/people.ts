/**
 * People and webhooks for recruiting tools: a person of the people tools as one flat record for an ATS or a CRM, and the
 * account webhooks (https://alion.io/developers/webhooks) checked and typed in one call.
 *
 * ```ts
 * import { Alion, toCandidateRecord, parseWebhook } from '@alion-io/sdk';
 * const alion = new Alion();
 * const { items } = await alion.matchPeople({ role: 'Backend', technology: 'Python,Kubernetes', can_work_in: 'US' });
 * const rows = items.map(toCandidateRecord);           // key them by person_id
 *
 * // your webhook endpoint
 * const event = await parseWebhook(rawBody, req.headers['x-alion-signature'], process.env.ALION_WEBHOOK_SECRET!);
 * if (event.event === 'candidate.erased') await ats.delete(event.data.person.person_id);
 * ```
 */
import { AlionError } from './errors.js';
import { verifyWebhook } from './helpers.js';
import type { VerifyWebhookOptions } from './helpers.js';

/** One person as a flat record: the fields an ATS or a CRM keeps, keyed by the stable `person_id`. */
export interface CandidateRecord {
    /** Alion's stable id of the person (`p_...`): it never changes, unlike the handle. Key your records by it. */
    person_id: string | null;
    /** The handle at the time of the read (pass it to getPerson, checkFit, sendMessage). */
    handle: string | null;
    name: string | null;
    headline: string | null;
    seniority: string | null;
    years_experience: number | null;
    country: string | null;
    city: string | null;
    /** The skills, strongest first, joined with "; ". */
    skills: string;
    /** The current job, "Title at Company". */
    current_job: string | null;
    availability: string | null;
    work_modes: string;
    can_work_in: string;
    last_active: string | null;
    url: string | null;
    /** Only what the person gave your account (an application to your vacancy), as their privacy lets you see it. */
    phone: string | null;
    linkedin: string | null;
    telegram: string | null;
    github: string | null;
    /** On what the contacts were given ("applied"), when they were. */
    contacts_basis: string | null;
}

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null);
const list = (v: unknown, pick?: (x: Obj) => unknown): string =>
    Array.isArray(v) ? v.map((x) => (pick && x && typeof x === 'object' ? pick(x as Obj) : x)).filter((x) => x !== null && x !== undefined && x !== '').join('; ') : '';

/** A row of searchPeople / matchPeople / similarPeople, or a profile of getPerson, as a {@link CandidateRecord}. */
export function toCandidateRecord(person: Obj): CandidateRecord {
    const loc = (person.location ?? {}) as Obj;
    const contacts = (person.contacts ?? {}) as Obj;
    const shared = (person.contacts_shared ?? {}) as Obj;
    const jobs = (Array.isArray(person.recent_jobs) ? person.recent_jobs : Array.isArray(person.experience) ? person.experience : []) as Obj[];
    const now = jobs.find((j) => j.current) ?? null;
    const wants = (person.wants ?? {}) as Obj;
    return {
        person_id: str(person.person_id),
        handle: str(person.person),
        name: str(person.name),
        headline: str(person.headline),
        seniority: str(person.seniority),
        years_experience: typeof person.years_experience === 'number' ? person.years_experience : null,
        country: str(loc.country),
        city: str(loc.city),
        skills: list(person.skills, (s) => s.name),
        current_job: now ? [str(now.title), str(now.company)].filter(Boolean).join(' at ') || null : null,
        availability: str(person.availability) ?? str(wants.availability),
        work_modes: list(person.work_modes ?? wants.work_modes),
        can_work_in: list(person.can_work_in),
        last_active: str(person.last_active),
        url: str(person.url),
        phone: str(contacts.phone),
        linkedin: str(contacts.linkedin),
        telegram: str(contacts.telegram),
        github: str(contacts.github) ?? str(((person.work_links ?? {}) as Obj).github),
        contacts_basis: str(shared.basis),
    };
}

/** The events of the account webhooks; the ones after `window.opened` start with client shortlists, job orders and contact sharing. */
export const WEBHOOK_EVENTS = [
    'candidate.replied', 'candidate.consented', 'candidate.erased', 'role.became_hard', 'window.opened',
    'candidate.consent_revoked', 'shortlist.candidate_added', 'client.shortlist_opened', 'client.invited', 'order.new_matches',
] as const;
export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

/** A person as an event names them. */
export interface WebhookPerson {
    person_id: string;
    person?: string | null;
    name?: string | null;
    url?: string | null;
}

/** The data of the events sent today; the others are `Record<string, unknown>` until their source ships. */
export interface WebhookData {
    'candidate.replied': { person: WebhookPerson; conversation: { id: number; url: string }; message: { id: number; text: string; at: string }; test?: boolean };
    'candidate.consented': { person: WebhookPerson; basis: string; contacts: Record<string, string>; job: { id: number; title: string; url: string }; test?: boolean };
    'candidate.erased': { person: WebhookPerson; reason: 'account_deleted' | 'account_closed' | 'profile_hidden' | 'opted_out_of_agencies'; action: 'delete'; note: string; test?: boolean };
    'role.became_hard': {
        selection: { id: number; title: string; url: string };
        roles: Array<{ job_id: number; title: string; url: string; company: { name: string; domain: string | null; url: string }; days_open: number; reposted: boolean; pay_usd_year: number | null; pay_estimated: boolean }>;
        count: number;
        test?: boolean;
    };
    'window.opened': { company: { name: string; domain: string; url: string }; windows: Array<Record<string, unknown>>; test?: boolean };
}

/** One delivery of an account webhook. */
export type WebhookEvent = {
    [K in WebhookEventName]: { id: string; event: K; created: string; api_version: string; data: K extends keyof WebhookData ? WebhookData[K] : Record<string, unknown> };
}[WebhookEventName];

/**
 * Checks the signature of an account webhook and returns its event, typed by its name; throws AlionError
 * `invalid_signature` when the signature, the secret or the timestamp does not hold, `invalid_body` when the body is not an event.
 * Pass the RAW body (before any JSON parsing): the signature is over its exact bytes.
 */
export async function parseWebhook(body: string | Uint8Array, signature: string | null | undefined, secret: string, options: VerifyWebhookOptions = {}): Promise<WebhookEvent> {
    if (!(await verifyWebhook(body, signature, secret, options))) {
        throw new AlionError('The webhook signature does not hold for this body and secret (or its timestamp is too old).', { code: 'invalid_signature' });
    }
    let event: unknown;
    try {
        event = JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body));
    } catch {
        throw new AlionError('The webhook body is not JSON.', { code: 'invalid_body' });
    }
    if (!event || typeof event !== 'object' || typeof (event as Obj).event !== 'string' || typeof (event as Obj).data !== 'object') {
        throw new AlionError('The webhook body is not an Alion event.', { code: 'invalid_body' });
    }
    return event as WebhookEvent;
}
