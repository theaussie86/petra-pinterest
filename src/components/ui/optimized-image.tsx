const ALLOWED_SIZES = [48, 96, 128, 256, 384, 512, 640, 750, 800, 828, 1080, 1200, 1920, 2048, 3840]

function snapToAllowedSize(width: number): number {
  return ALLOWED_SIZES.find(s => s >= width) ?? ALLOWED_SIZES[ALLOWED_SIZES.length - 1]
}

type OptimizedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string
  width: number
  height?: number
}

function useVercelOptimizedImageProps(src: string, width: number) {
  if (import.meta.env.PROD !== true || !src) return { src }
  const encoded = encodeURIComponent(src)
  return {
    src: `/_vercel/image?url=${encoded}&w=${snapToAllowedSize(width)}&q=75`,
    srcSet: [1, 2]
      .map(d => `/_vercel/image?url=${encoded}&w=${snapToAllowedSize(width * d)}&q=75 ${d}x`)
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
