/* eslint-disable @typescript-eslint/ban-ts-comment */
import { CSSObject, UseThemeFunction } from '@theme-ui/css'
import { Platform } from 'react-native'
import { defaultBreakpoints } from './breakpoints'
import { SUPPORT_FRESNEL_SSR } from '../utils/deprecated-ssr'
import { DripsyFinalTheme } from '../declarations'

import type { SxProp } from './types'
import { get } from './get'
import { Aliases, aliases, scales, Scales } from './scales'

type SxProps = SxProp

type Theme = DripsyFinalTheme

type CssPropsArgument = ({ theme?: Theme } | Theme) & {
  /**
   * We use this for a custom font family.
   */
  fontFamily?: string
}

const defaultTheme = {
  space: [0, 4, 8, 16, 32, 64, 128, 256, 512],
  fontSizes: [12, 14, 16, 20, 24, 32, 48, 64, 72],
}

export type ResponsiveSSRStyles = Exclude<
  NonNullable<SxProps>,
  UseThemeFunction
>[]

const responsive = (
  styles: Exclude<SxProps, UseThemeFunction>,
  { breakpoint }: { breakpoint?: number } = {}
) => (theme?: Theme) => {
  const next: Exclude<SxProps, UseThemeFunction> & {
    responsiveSSRStyles?: ResponsiveSSRStyles
  } = {}

  for (const key in styles) {
    const value =
      typeof styles[key] === 'function' ? styles[key](theme) : styles[key]

    if (value == null) continue
    if (!Array.isArray(value)) {
      // @ts-ignore
      next[key] = value
      continue
    }

    if (key === 'transform') {
      // @ts-ignore
      next[key] = value
      continue
    }

    if (Platform.OS === 'web' && SUPPORT_FRESNEL_SSR) {
      next.responsiveSSRStyles = next.responsiveSSRStyles || []

      const mediaQueries = [0, ...defaultBreakpoints]

      for (let i = 0; i < mediaQueries.length; i++) {
        next.responsiveSSRStyles[i] = next.responsiveSSRStyles[i] || {}

        let styleAtThisMediaQuery = value[i]
        // say we have value value = ['blue', null, 'green']
        // then styleAtThisMediaQuery[1] = null
        // we want it to be blue, since it's mobile-first
        if (styleAtThisMediaQuery == null) {
          if (i === 0) {
            // if we're at the first breakpoint, and it's null, just do nothing
            // for later values, we'll extract this value from the previous value
            continue
          }
          // if we're after the first breakpoint, let's extract this style value from a previous breakpoint
          const nearestBreakpoint = (breakpointIndex: number): number => {
            // mobile-first breakpoints
            if (breakpointIndex <= 0 || typeof breakpointIndex !== 'number')
              return 0

            if (value[breakpointIndex] == null) {
              // if this value doesn't have a breakpoint, find the previous, recursively
              return nearestBreakpoint(breakpointIndex - 1)
            }
            return breakpointIndex
          }
          const previousBreakpoint = nearestBreakpoint(i)
          const styleAtPreviousMediaQuery = value[previousBreakpoint]
          if (styleAtPreviousMediaQuery) {
            styleAtThisMediaQuery = styleAtPreviousMediaQuery
          }
        }

        next.responsiveSSRStyles[i][key] = styleAtThisMediaQuery
      }
    } else {
      // since we aren't on web, we let RN handle the breakpoints with JS

      const nearestBreakpoint = (breakpointIndex: number): number => {
        // mobile-first breakpoints
        if (breakpointIndex <= 0 || typeof breakpointIndex !== 'number')
          return 0

        if (value[breakpointIndex] == null) {
          // if this value doesn't have a breakpoint, find the previous, recursively
          return nearestBreakpoint(breakpointIndex - 1)
        }
        return breakpointIndex
      }

      // if we're on mobile, we do have a breakpoint
      // so we can override TS here w/ `as number`
      const breakpointIndex = nearestBreakpoint(breakpoint as number)
      next[key] = value[breakpointIndex]
    }
  }

  return next
}

const positiveOrNegative = (scale: object, value: string | number) => {
  if (typeof value !== 'number' || value >= 0) {
    if (typeof value === 'string' && value.startsWith('-')) {
      const valueWithoutMinus = value.substring(1)
      const n = get(scale, valueWithoutMinus, valueWithoutMinus)
      return `-${n}`
    }
    return get(scale, value, value)
  }
  const absolute = Math.abs(value)
  const n = get(scale, absolute, absolute)
  if (typeof n === 'string') return '-' + n
  return Number(n) * -1
}

const transforms = [
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginX',
  'marginY',
  'marginBlock',
  'marginBlockEnd',
  'marginBlockStart',
  'marginInline',
  'marginInlineEnd',
  'marginInlineStart',
  'top',
  'bottom',
  'left',
  'right',
].reduce(
  (acc, curr) => ({
    ...acc,
    [curr]: positiveOrNegative,
  }),
  {}
)

/**
 * Here we remove web style keys from components to prevent annoying errors on native
 */
const filterWebStyleKeys = (
  styleProp: Exclude<SxProps, UseThemeFunction> = {}
): Exclude<SxProps, UseThemeFunction> => {
  if (Platform.OS == 'web') {
    return styleProp
  }

  // avoid prop mutations
  const finalStyles = { ...styleProp }
  const webOnlyKeys = [
    // from https://necolas.github.io/react-native-web/docs/styling/#non-standard-properties
    'animationKeyframes',
    'animationFillMode',
    'transitionProperty',
    'whiteSpace',
    'userSelect',
    'transitionDuration',
    'transitionTimingFunction',
    'cursor',
    'animationDuration',
    'animationDelay',
    'transitionDelay',
    'animationDirection',
    'animationIterationCount',
    'outlineColor',
  ]
  webOnlyKeys.forEach((key) => {
    if (finalStyles?.[key as keyof typeof styleProp]) {
      delete finalStyles?.[key as keyof typeof styleProp]
    }
  })

  return finalStyles
}

export const css = (
  args: SxProps = {},
  breakpoint?: number
  // { ssr }: { ssr?: boolean } = {}
) => (
  props: CssPropsArgument = {}
): CSSObject & { responsiveSSRStyles?: ResponsiveSSRStyles } => {
  const theme: DripsyFinalTheme = {
    ...defaultTheme,
    ...('theme' in props ? props.theme : props),
  } as DripsyFinalTheme
  let result: CSSObject & { responsiveSSRStyles?: ResponsiveSSRStyles } = {}
  const obj = typeof args === 'function' ? args(theme) : args
  const filteredOutWebKeys = filterWebStyleKeys(obj)
  const styles = responsive(filteredOutWebKeys, { breakpoint })(theme)

  for (const key in styles) {
    const x = styles[key]
    const val = typeof x == 'function' ? x(theme) : x

    if (key == 'variant') {
      const variant = css(get(theme, val))(theme)
      result = { ...result, ...variant }
      continue
    }

    if (key == 'transform') {
      result[key] = val
      continue
    }

    if (val && typeof val == 'object') {
      // @ts-ignore
      result[key] = css(val)(theme)
      continue
    }

    if (typeof val == 'boolean') {
      // StyleSheet doesn't allow booleans
      continue
    }

    const prop = key in aliases ? aliases[key as keyof Aliases] : key
    const scaleName = prop in scales ? scales[prop as keyof Scales] : undefined
    // @ts-expect-error
    const scale = get(theme, scaleName, get(theme, prop, {}))
    const transform = get(transforms, prop, get)
    const value = transform(scale, val, val)

    if (key === 'fontFamily') {
      // ok, building off of fontWeight prior
      // we just need to check if we've already set the fontFamily based on the weight
      // if we have, continue. Otherwise, set it

      if (result?.fontFamily) {
        continue
      }

      if (value === 'root') {
        // if we're setting this font to the `root` font,
        // make sure it actually exists
        // why? because by default, our text sets the `root` style
        // however, this only applies if you have a custom font
        // if you don't have a custom font named root, we shold ignore the fontFamily: 'root' definition
        if (!theme?.fonts?.root) {
          // techincally speaking, if value === 'root', this means that we already know there's no custom root font
          // why? bc value extracts the theme values. Since `root` is a reserved word in dripsy, we know this wouldn't work.
          // however, we still check to make sure. It's also easier to understand if I forget later,
          // ...or if someone accidentally names a font `root` even though the docs say not to
          continue
        }
      }
      // ok, no font-family set yet, so let's continue.
    }

    if (key == 'fontWeight' && styles?.fontWeight) {
      // let's check if we have a custom font that corresponds to this font weight
      // we have a custom font for this family in our theme
      // example: if we pass fontWeight: 'bold', and fontFamily: 'arial', this will be true for themes that have
      // customFonts: {arial: {bold: 'arialBold'}}
      // we also pass the font-family from other CSS props here at the top of the function, so fall back to that if it exists
      const fontFamilyKeyFromStyles =
        (styles?.fontFamily as string) ?? props?.fontFamily

      // default font for all text styles
      const rootFontFamilyFromTheme = theme?.fonts?.root

      // either the raw value, or one from our theme
      if (fontFamilyKeyFromStyles || rootFontFamilyFromTheme) {
        const fontWeight = value
        let fontFamily
        if (fontFamilyKeyFromStyles) {
          // first, check if our theme has a font with this name. If not, just use the normal name.
          // for instance, if we pass fontFamily: 'body', and our theme has:
          // { fonts: {body: 'arial'}} (<- in this case, if fontFamilyKey = 'body', we get 'arial' back)
          // then we'd want to get fonts.body = 'arial'
          // however, if we're just writing fontFamily: 'arial' instead of 'body', we need no alias
          fontFamily =
            theme?.fonts?.[fontFamilyKeyFromStyles] ?? fontFamilyKeyFromStyles
        } else if (rootFontFamilyFromTheme) {
          fontFamily = rootFontFamilyFromTheme
        }
        // const fontFamily =
        //   (theme?.fonts as any)?.[fontFamilyKey] ?? fontFamilyKey
        if (fontFamily) {
          if (typeof fontFamily != 'string') {
            console.error(
              `[dripsy] error. Passed font family name that was not a string. This value should either be a string which corresponds to a key of your theme.fonts, or, it should be a string that corresponds to a raw font name. Your font will not be applied, please resolve this.`
            )
            continue
          }
          const customFontFamilyForWeight =
            theme?.customFonts?.[fontFamily]?.[fontWeight]
          if (customFontFamilyForWeight) {
            // ok, now we just need to set the fontFamily to this value. oof
            // following the comment above, in this case, we set fontFamily: `arialBold`
            result.fontFamily = customFontFamilyForWeight
            continue
          }
        }
      }
    }
    if (key == 'size') {
      result.width = value
      result.height = value
    } else {
      result[prop] = value
    }
  }

  return result
}

export class Styles {
  static create<T extends { [key: string]: NonNullable<SxProps> }>(
    styles: T
  ): T {
    return styles
  }
}
