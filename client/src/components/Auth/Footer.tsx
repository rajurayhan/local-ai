import type { TStartupConfig } from 'librechat-data-provider';
import { resolvePrivacyUrl, resolveTermsUrl } from '~/utils';
import PolicyLink from '~/components/Legal/PolicyLink';
import { useLocalize } from '~/hooks';

const legalLinkClassName =
  'text-sm text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  if (!startupConfig) {
    return null;
  }
  const privacyUrl = resolvePrivacyUrl(startupConfig.interface?.privacyPolicy?.externalUrl);
  const termsUrl = resolveTermsUrl(startupConfig.interface?.termsOfService?.externalUrl);

  const privacyPolicyRender = (
    <PolicyLink className={legalLinkClassName} href={privacyUrl}>
      {localize('com_ui_privacy_policy')}
    </PolicyLink>
  );

  const termsOfServiceRender = (
    <PolicyLink className={legalLinkClassName} href={termsUrl}>
      {localize('com_ui_terms_of_service')}
    </PolicyLink>
  );

  return (
    <div className="align-end m-4 flex justify-center gap-2" role="contentinfo">
      {privacyPolicyRender}
      {privacyPolicyRender && termsOfServiceRender && (
        <div className="border-r-[1px] border-border-medium" />
      )}
      {termsOfServiceRender}
    </div>
  );
}

export default Footer;
