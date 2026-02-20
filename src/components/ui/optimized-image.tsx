type OptimizedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string
  width: number
  height?: number
}

function useVercelOptimizedImageProps(src: string, width: number) {
  if (import.meta.env.DEV || !src) return { src }
  const encoded = encodeURIComponent(src)
  return {
    src: `/_vercel/image?url=${encoded}&w=${width}&q=75`,
    srcSet: [1, 2]
      .map(d => `/_vercel/image?url=${encoded}&w=${width * d}&q=75 ${d}x`)
      .join(', '),
  }
}

export function OptimizedImage({
  src,
  width,
  height,
  loading = 'lazy',
  ...props
}: OptimizedImageProps) {
  const imgProps = useVercelOptimizedImageProps(src, width)
  return <img {...props} {...imgProps} width={width} height={height} loading={loading} />
}
