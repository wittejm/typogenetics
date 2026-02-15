"""
Visualize soup simulation results.
Reads JSON from data/quest_findings/, renders PNGs to same directory.

Usage: /Users/jordan/Dropbox/typogenetics/quest/venv/bin/python3 quest/viz.py [config_name]
If no config_name given, processes all JSON files found.
"""

import json
import sys
import os
from pathlib import Path

import matplotlib
matplotlib.use('Agg')  # headless
import matplotlib.pyplot as plt
import matplotlib.cm as cm
import networkx as nx
import numpy as np

DATA_DIR = Path(__file__).parent.parent / 'data' / 'quest_findings'


def load_result(name: str) -> dict:
    path = DATA_DIR / f'{name}.json'
    with open(path) as f:
        return json.load(f)


def render_production_graph(result: dict, out_path: Path):
    """Force-directed production graph. Nodes = strands, edges = production relationships."""
    edges = result['productionEdges']
    if not edges:
        print(f"  No production edges, skipping graph")
        return

    G = nx.DiGraph()
    for e in edges:
        G.add_edge(e['catalyst'], e['product'], weight=e['count'])

    if len(G.nodes) == 0:
        return

    # Node sizing by total degree (in + out)
    degrees = dict(G.degree())
    max_deg = max(degrees.values()) if degrees else 1
    node_sizes = [300 + 1500 * (degrees.get(n, 0) / max_deg) for n in G.nodes]

    # Node coloring by in-degree (how many things produce it)
    in_degrees = dict(G.in_degree())
    max_in = max(in_degrees.values()) if in_degrees else 1
    node_colors = [in_degrees.get(n, 0) / max_in for n in G.nodes]

    # Edge widths by weight
    weights = [G[u][v]['weight'] for u, v in G.edges]
    max_w = max(weights) if weights else 1
    edge_widths = [0.5 + 3.0 * (w / max_w) for w in weights]

    # Find mutual pairs for highlighting
    mutual_edges = []
    for u, v in G.edges:
        if G.has_edge(v, u):
            mutual_edges.append((u, v))

    fig, ax = plt.subplots(1, 1, figsize=(14, 14))

    pos = nx.spring_layout(G, k=2.0 / (len(G.nodes) ** 0.5) if len(G.nodes) > 1 else 1, iterations=100, seed=42)

    # Draw all edges
    nx.draw_networkx_edges(G, pos, ax=ax, edge_color='#cccccc', width=edge_widths,
                           alpha=0.4, arrows=True, arrowsize=10,
                           connectionstyle='arc3,rad=0.1')

    # Highlight mutual edges in red
    if mutual_edges:
        mutual_widths = [0.5 + 3.0 * (G[u][v]['weight'] / max_w) for u, v in mutual_edges]
        nx.draw_networkx_edges(G, pos, edgelist=mutual_edges, ax=ax,
                               edge_color='red', width=mutual_widths,
                               alpha=0.7, arrows=True, arrowsize=12,
                               connectionstyle='arc3,rad=0.1')

    # Draw nodes
    nodes = nx.draw_networkx_nodes(G, pos, ax=ax, node_size=node_sizes,
                                    node_color=node_colors, cmap=cm.viridis,
                                    alpha=0.85, edgecolors='black', linewidths=0.5)

    # Labels — only for top nodes by degree
    top_n = min(25, len(G.nodes))
    top_nodes = sorted(G.nodes, key=lambda n: degrees.get(n, 0), reverse=True)[:top_n]
    labels = {n: n[:8] + '..' if len(n) > 10 else n for n in top_nodes}
    nx.draw_networkx_labels(G, pos, labels, ax=ax, font_size=6, font_weight='bold')

    name = result['config']['name']
    ax.set_title(f"Production Graph: {name}\n"
                 f"{len(G.nodes)} nodes, {len(G.edges)} edges, "
                 f"{len(mutual_edges)} mutual edges (red)",
                 fontsize=12)
    plt.colorbar(nodes, ax=ax, label='In-degree (normalized)', shrink=0.6)
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()
    print(f"  Saved {out_path}")


def render_pool_composition(result: dict, out_path: Path):
    """Stacked area chart showing pool composition over time."""
    snapshots = result['snapshots']
    if len(snapshots) < 2:
        print(f"  Too few snapshots, skipping composition chart")
        return

    # Collect all strands that ever appear
    all_strands = set()
    for snap in snapshots:
        all_strands.update(snap['pool'].keys())

    # Find the top N most frequent strands (by max count across snapshots)
    strand_max = {}
    for s in all_strands:
        strand_max[s] = max(snap['pool'].get(s, 0) for snap in snapshots)

    TOP_N = 20
    top_strands = sorted(all_strands, key=lambda s: strand_max[s], reverse=True)[:TOP_N]

    ops = [snap['op'] for snap in snapshots]
    strand_counts = {s: [snap['pool'].get(s, 0) for snap in snapshots] for s in top_strands}

    # "Other" category
    other = []
    for i, snap in enumerate(snapshots):
        total = snap['poolSize']
        top_total = sum(strand_counts[s][i] for s in top_strands)
        other.append(total - top_total)

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10))

    # Stacked area
    arrays = [strand_counts[s] for s in top_strands] + [other]
    labels_list = [s[:12] for s in top_strands] + ['other']
    colors = plt.cm.tab20(np.linspace(0, 1, len(arrays)))

    ax1.stackplot(ops, *arrays, labels=labels_list, colors=colors, alpha=0.8)
    ax1.set_xlabel('Operations')
    ax1.set_ylabel('Count in pool')
    ax1.set_title(f"Pool Composition: {result['config']['name']}")
    ax1.legend(loc='upper left', fontsize=5, ncol=3)

    # Unique count over time
    unique_counts = [snap['uniqueCount'] for snap in snapshots]
    pool_sizes = [snap['poolSize'] for snap in snapshots]
    ax2.plot(ops, pool_sizes, label='Pool size', color='blue', alpha=0.7)
    ax2.plot(ops, unique_counts, label='Unique strands', color='red', alpha=0.7)
    ax2.set_xlabel('Operations')
    ax2.set_ylabel('Count')
    ax2.set_title('Pool Size & Diversity')
    ax2.legend()

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()
    print(f"  Saved {out_path}")


def render_cycle_analysis(result: dict, out_path: Path):
    """Find and visualize cycles in the production graph."""
    edges = result['productionEdges']
    if not edges:
        return

    G = nx.DiGraph()
    for e in edges:
        G.add_edge(e['catalyst'], e['product'], weight=e['count'])

    # Find all simple cycles up to length 4
    cycles = []
    try:
        for cycle in nx.simple_cycles(G, length_bound=4):
            if len(cycle) >= 2:
                # Calculate total weight of cycle
                total_w = 0
                for i in range(len(cycle)):
                    u, v = cycle[i], cycle[(i + 1) % len(cycle)]
                    total_w += G[u][v]['weight']
                cycles.append((cycle, total_w))
    except Exception:
        pass

    cycles.sort(key=lambda x: x[1], reverse=True)

    fig, ax = plt.subplots(1, 1, figsize=(12, 8))

    if not cycles:
        ax.text(0.5, 0.5, 'No cycles found (length 2-4)',
                ha='center', va='center', fontsize=16, transform=ax.transAxes)
    else:
        # Show top 20 cycles as a table
        top_cycles = cycles[:20]
        table_data = []
        for cycle, weight in top_cycles:
            cycle_str = ' → '.join(c[:10] for c in cycle) + ' → ' + cycle[0][:10]
            table_data.append([len(cycle), cycle_str, weight])

        ax.axis('off')
        table = ax.table(cellText=table_data,
                        colLabels=['Length', 'Cycle', 'Total Weight'],
                        loc='center', cellLoc='left')
        table.auto_set_font_size(False)
        table.set_fontsize(7)
        table.scale(1, 1.5)

    name = result['config']['name']
    ax.set_title(f"Cycles in Production Graph: {name}\n"
                 f"{len(cycles)} cycles found (length 2-4)",
                 fontsize=12, pad=20)

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()
    print(f"  Saved {out_path}")


def process(name: str):
    print(f"\nProcessing: {name}")
    result = load_result(name)

    render_production_graph(result, DATA_DIR / f'{name}_graph.png')
    render_pool_composition(result, DATA_DIR / f'{name}_composition.png')
    render_cycle_analysis(result, DATA_DIR / f'{name}_cycles.png')


if __name__ == '__main__':
    if len(sys.argv) > 1:
        for name in sys.argv[1:]:
            process(name)
    else:
        # Process all JSON files
        for p in sorted(DATA_DIR.glob('*.json')):
            process(p.stem)
