import Link from "next/link";

export type PrioritySignalsProduct = "home" | "worldsignal" | "credsignal";

const products: Array<{
  id: PrioritySignalsProduct;
  name: string;
  description: string;
  href: string;
  symbol: string;
}> = [
  {
    id: "home",
    name: "Home",
    description: "People and approved locations",
    href: "/home",
    symbol: "H",
  },
  {
    id: "worldsignal",
    name: "WorldSignal",
    description: "Physical threat awareness",
    href: "/worldsignal",
    symbol: "W",
  },
  {
    id: "credsignal",
    name: "CredSignal",
    description: "Credential exposure response",
    href: "/credsignal",
    symbol: "C",
  },
];

interface ProductSwitcherProps {
  currentProduct: PrioritySignalsProduct;
}

export function ProductSwitcher({ currentProduct }: ProductSwitcherProps) {
  const selected = products.find((product) => product.id === currentProduct);

  if (!selected) {
    return null;
  }

  return (
    <details className="product-switcher">
      <summary className="product-switcher-trigger">
        <span className="priority-symbol" aria-hidden="true">
          P
        </span>
        <span className="product-switcher-title">
          <span className="priority-wordmark">Priority Signals</span>
          <span className="current-product">{selected.name}</span>
        </span>
        <span className="product-switcher-chevron" aria-hidden="true">
          ▾
        </span>
        <span className="sr-only">Switch Priority Signals product</span>
      </summary>

      <nav
        className="product-switcher-menu"
        aria-label="Priority Signals products"
      >
        <p className="product-switcher-menu-label">Operational products</p>
        {products.map((product) => (
          <Link
            aria-current={product.id === currentProduct ? "page" : undefined}
            className="product-switcher-option"
            href={product.href}
            key={product.id}
          >
            <span className="product-option-symbol" aria-hidden="true">
              {product.symbol}
            </span>
            <span>
              <strong>{product.name}</strong>
              <small>{product.description}</small>
            </span>
            {product.id === currentProduct ? (
              <span className="product-current-marker">Current</span>
            ) : null}
          </Link>
        ))}
      </nav>
    </details>
  );
}
