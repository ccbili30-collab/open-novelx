import { type ComponentProps } from "solid-js"

import catMark from "../assets/novelx/novelx-cat-mark.png"

export const novelxMarkUrl = catMark

type ImageProps = Pick<ComponentProps<"img">, "ref" | "class">

export const NovelXMark = (props: ImageProps) => (
  <img
    ref={props.ref}
    data-component="novelx-logo-mark"
    classList={{ [props.class ?? ""]: !!props.class }}
    src={catMark}
    alt=""
    aria-hidden="true"
    draggable={false}
  />
)

export const NovelXSplash = (props: ImageProps) => (
  <img
    ref={props.ref}
    data-component="novelx-logo-splash"
    classList={{ [props.class ?? ""]: !!props.class }}
    src={catMark}
    alt=""
    aria-hidden="true"
    draggable={false}
  />
)

export const NovelXLogo = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => (
  <svg
    ref={props.ref}
    data-component="novelx-logo"
    classList={{ [props.class ?? ""]: !!props.class }}
    viewBox="0 0 256 64"
    role="img"
    aria-label="NovelX"
    xmlns="http://www.w3.org/2000/svg"
  >
    <image href={catMark} width="64" height="64" />
    <text
      x="78"
      y="45"
      fill="currentColor"
      font-family="Segoe UI, Microsoft YaHei UI, sans-serif"
      font-size="40"
      font-weight="650"
      letter-spacing="0.4"
    >
      NovelX
    </text>
  </svg>
)
