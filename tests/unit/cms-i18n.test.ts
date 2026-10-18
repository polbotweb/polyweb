import { describe, it, expect } from 'vitest';
import { getAuthTranslations } from '@i18n/utils';
import { LOCALES, type Locale } from '@i18n/config';

const locales: Locale[] = [...LOCALES];

describe('CMS i18n — site translations', () => {
  it.each(locales)('%s has all cms.site keys', async (locale) => {
    const t = await getAuthTranslations(locale);
    const site = t.admin.cms.site;

    expect(site.title).toBeTypeOf('string');
    expect(site.tabSettings).toBeTypeOf('string');
    expect(site.tabSocial).toBeTypeOf('string');
    expect(site.tabContact).toBeTypeOf('string');
    expect(site.tabHours).toBeTypeOf('string');
    expect(site.siteName).toBeTypeOf('string');
    expect(site.logoLight).toBeTypeOf('string');
    expect(site.logoDark).toBeTypeOf('string');
    expect(site.favicon).toBeTypeOf('string');
    expect(site.ogImage).toBeTypeOf('string');
    expect(site.uploadImage).toBeTypeOf('string');
    expect(site.middayBreak).toBeTypeOf('string');
    expect(site.morningOpen).toBeTypeOf('string');
    expect(site.morningClose).toBeTypeOf('string');
    expect(site.afternoonOpen).toBeTypeOf('string');
    expect(site.afternoonClose).toBeTypeOf('string');
    expect(site.dayNames).toBeInstanceOf(Array);
    expect(site.dayNames.length).toBe(7);
  });
});

describe('CMS i18n — navigation translations', () => {
  it.each(locales)('%s has all cms.navigation keys', async (locale) => {
    const t = await getAuthTranslations(locale);
    const nav = t.admin.cms.navigation;

    expect(nav.title).toBeTypeOf('string');
    expect(nav.addItem).toBeTypeOf('string');
    expect(nav.labelField).toBeTypeOf('string');
    expect(nav.urlField).toBeTypeOf('string');
    expect(nav.parentField).toBeTypeOf('string');
    expect(nav.iconField).toBeTypeOf('string');
    expect(nav.selectIcon).toBeTypeOf('string');
    expect(nav.searchIcon).toBeTypeOf('string');
    expect(nav.clearIcon).toBeTypeOf('string');
    expect(nav.sortOrderField).toBeTypeOf('string');
    expect(nav.openInNewTab).toBeTypeOf('string');
    expect(nav.save).toBeTypeOf('string');
    expect(nav.saved).toBeTypeOf('string');
    expect(nav.deleted).toBeTypeOf('string');
  });
});

describe('CMS i18n — theme translations', () => {
  it.each(locales)('%s has all cms.theme keys', async (locale) => {
    const t = await getAuthTranslations(locale);
    const theme = t.admin.cms.theme;

    expect(theme.title).toBeTypeOf('string');
    expect(theme.createTheme).toBeTypeOf('string');
    expect(theme.active).toBeTypeOf('string');
    expect(theme.activate).toBeTypeOf('string');
    expect(theme.deleteTheme).toBeTypeOf('string');
    expect(theme.cannotDeleteActive).toBeTypeOf('string');
  });
});

describe('CMS i18n — common translations', () => {
  it.each(locales)('%s has all cms.common keys', async (locale) => {
    const t = await getAuthTranslations(locale);
    const common = t.admin.cms.common;

    expect(common.actions).toBeTypeOf('string');
    expect(common.delete).toBeTypeOf('string');
    expect(common.sortOrder).toBeTypeOf('string');
    expect(common.confirmDelete).toBeTypeOf('string');
    expect(common.error).toBeTypeOf('string');
  });
});
