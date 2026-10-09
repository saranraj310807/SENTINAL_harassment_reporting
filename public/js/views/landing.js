import { icon } from '../components/icons.js';
import { auth } from '../services/auth.js';

export function renderLandingView() {
  const user = auth.user;
  const isAuth = Boolean(user);

  return `
    <div class="landing-page" style="padding-bottom: 60px;">
      <!-- Hero Section -->
      <section style="background: linear-gradient(180deg, #070B1A 0%, #0E1530 100%); color: #FFFFFF; padding: 64px 24px; text-align: center; border-bottom: 1px solid #1E2958;">
        <div style="max-width: 860px; margin: 0 auto;">
          <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(20, 184, 166, 0.1); border: 1px solid rgba(20, 184, 166, 0.3); padding: 6px 14px; border-radius: 9999px; font-size: 0.8125rem; color: #22D3EE; margin-bottom: 24px;">
            ${icon('shield', '', 16)} Official Campus Safety & Confidential Reporting Prototype
          </div>

          <h1 style="font-size: clamp(2rem, 5vw, 3.25rem); font-weight: 800; line-height: 1.15; margin-bottom: 16px; letter-spacing: -0.02em;">
            SENTINEL
          </h1>
          <p style="font-size: clamp(1.125rem, 2.5vw, 1.5rem); color: #94A3B8; font-weight: 500; margin-bottom: 12px;">
            "Your Safety. Your Identity. Your Control."
          </p>
          <p style="font-size: 0.9375rem; color: #64748B; max-width: 640px; margin: 0 auto 32px; line-height: 1.6;">
            A confidential sanctuary for university students to report online and offline ragging, harassment, bullying, and intimidation by written complaint or direct audio recording.
          </p>

          <div style="display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap;">
            ${isAuth ? `
              <a href="#/dashboard" class="btn btn-primary" style="padding: 12px 28px; font-size: 1rem;">
                Go to Dashboard ${icon('arrowRight', '', 16)}
              </a>
            ` : `
              <a href="#/login" class="btn btn-primary" style="padding: 12px 28px; font-size: 1rem;">
                Student & Staff Login ${icon('arrowRight', '', 16)}
              </a>
              <a href="#/register" class="btn btn-secondary" style="padding: 12px 24px;">
                Register Student Account
              </a>
            `}
          </div>
        </div>
      </section>

      <!-- Core Integrity Pillars -->
      <section class="page-container" style="margin-top: 40px;">
        <h2 style="font-size: 1.375rem; font-weight: 700; color: #0F172A; text-align: center; margin-bottom: 32px;">
          Institutional Safety Framework
        </h2>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 40px;">
          <!-- Pillar 1 -->
          <div class="card" style="margin-bottom: 0;">
            <div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(20, 184, 166, 0.1); color: #0D9488; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              ${icon('mic', '', 22)}
            </div>
            <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 8px;">Direct Audio Complaints</h3>
            <p style="font-size: 0.875rem; color: #475569; line-height: 1.6;">
              Record your testimony in Tamil, English, or regional languages. In compliance with strict safety policy, <strong>zero automated transcription or speech-to-text</strong> is applied. Original encrypted audio is verified by SHA-256 hash.
            </p>
          </div>

          <!-- Pillar 2 -->
          <div class="card" style="margin-bottom: 0;">
            <div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(139, 124, 255, 0.1); color: #6366F1; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              ${icon('shield', '', 22)}
            </div>
            <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 8px;">Transparent Escalation Engine</h3>
            <p style="font-size: 0.875rem; color: #475569; line-height: 1.6;">
              Rule-based pattern detection alerts staff to potential repeat incidents. Potential links require human authority review and never change counts automatically. Confirmed links systematically escalate from HOD to Dean and Higher Authority.
            </p>
          </div>

          <!-- Pillar 3 -->
          <div class="card" style="margin-bottom: 0;">
            <div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(6, 182, 212, 0.1); color: #0891B2; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              ${icon('camera', '', 22)}
            </div>
            <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 8px;">Smart CCTV Preservation</h3>
            <p style="font-size: 0.875rem; color: #475569; line-height: 1.6;">
              Identify overlapping campus camera zones and retention deadlines without fake feeds. Students and officials generate targeted footage preservation requests before overwrites occur.
            </p>
          </div>
        </div>

        <!-- Privacy & Honest Limits Notice -->
        <div class="card" style="background: #F8FAFC; border-color: #E2E8F0;">
          <h3 style="font-size: 1rem; font-weight: 700; color: #0F172A; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            ${icon('lock', 'text-teal', 18)} Plain Language Confidentiality & Legal Limits
          </h3>
          <ul style="padding-left: 20px; font-size: 0.875rem; color: #475569; line-height: 1.7;">
            <li>Reports can be filed confidentially or with identity masked to initial departmental reviewers.</li>
            <li>If disciplinary proceedings or statutory police inquiries are triggered, disclosure may be legally mandated.</li>
            <li>Voice recordings and specific incident details may inadvertently identify a student to peers.</li>
            <li>Every access to audio, evidence, and contact details is logged in an immutable append-only audit trail.</li>
          </ul>
        </div>
      </section>
    </div>
  `;
}
