import React from 'react';

export const TapakSunanLogo: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => {
  return (
    <img
      src="/assets/aistudio/images_b6b04964.jpg"
      alt="Logo Pondok Pesantren Tapak Sunan"
      referrerPolicy="no-referrer"
      className={`${className} object-contain bg-white rounded-md`}
    />
  );
};
