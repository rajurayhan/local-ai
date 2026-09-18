import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isInAppHref } from '~/utils';

function PolicyLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  if (isInAppHref(href)) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} className={className} rel="noreferrer">
      {children}
    </a>
  );
}

export default PolicyLink;
