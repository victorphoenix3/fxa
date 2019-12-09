import React, { useEffect, useContext } from 'react';
import { Plan } from '../../../store/types';
import { AppContext } from '../../../lib/AppContext';

import { metadataFromPlan } from '../../../store/utils';
import fpnImage from '../../../images/fpn';
import './index.scss';

const defaultProductRedirectURL = 'https://mozilla.org';

export type SubscriptionRedirectProps = {
  plan: Plan;
};

export const SubscriptionRedirect = ({ plan }: SubscriptionRedirectProps) => {
  const { product_id, product_name } = plan;
  const { webIconURL, downloadURL } = metadataFromPlan(plan);
  const {
    config: { productRedirectURLs },
    navigateToUrl,
  } = useContext(AppContext);

  const redirectUrl =
    downloadURL || productRedirectURLs[product_id] || defaultProductRedirectURL;

  // useEffect(() => {
  //   window.addEventListener('message', handleIframeTask);
  // });

  // const handleIframeTask = (e: any) => {
  //   if (e.data === 'submitted survey') {
  //     navigateToUrl(redirectUrl);
  //   }
  // };
  useEffect(() => {
    const handleIframeTask = (e: any) => {
      if (e.data === 'submitted survey') {
        navigateToUrl(redirectUrl);
      }
    };
    window.addEventListener('message', handleIframeTask);
    return () => window.removeEventListener('message', handleIframeTask);
  }, [redirectUrl]);

  return (
    <div className="product-payment" data-testid="subscription-redirect">
      <div className="subscription-ready">
        <div className="subscription-message">
          <h2>Your subscription is ready</h2>
        </div>
        <div className="form-break-top break-buffer"></div>
        <div className="exp-message">
          Please take a moment to tell us about your experience.
        </div>
        <div className="survey-frame">
          <iframe
            sandbox="allow-scripts allow-forms"
            src="http://www.surveygizmo.com/s3/5294819/VPN-Subscription?__no_style=true"
          ></iframe>
        </div>
        <div className="form-break-bottom break-buffer"></div>
        <div>
          <a href={redirectUrl}>No thanks, just take me to my product.</a>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionRedirect;
