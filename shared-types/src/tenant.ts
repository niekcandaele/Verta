export type TenantStatus = 'ACTIVE' | 'CANCELLED' | 'MAINTENANCE';
export type Platform = 'slack' | 'discord';

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  platform: Platform;
  platformId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTenantData = {
  name: string;
  slug: string;
  status?: TenantStatus;
  platform: Platform;
  platformId: string;
};

export type UpdateTenantData = {
  name?: string;
  slug?: string;
  status?: TenantStatus;
  platform?: Platform;
  platformId?: string;
};

export type TenantBranding = {
  id: string;
  tenantId: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTenantBrandingData = {
  tenantId: string;
  logo?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
};

export type UpdateTenantBrandingData = {
  logo?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
};
