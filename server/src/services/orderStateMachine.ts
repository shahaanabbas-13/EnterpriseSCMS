import { OrderStatus } from '../types';
import { ApiError } from '../utils/ApiError';

/**
 * Finite State Machine for Order lifecycle.
 *
 * This is a KEY INTERVIEW TOPIC. The FSM pattern ensures:
 * 1. No invalid state transitions (CREATED cannot jump to SHIPPED)
 * 2. Every transition is explicit and auditable
 * 3. Side effects are triggered predictably per transition
 *
 * State Diagram:
 *   CREATED → APPROVED → PICKING → PACKED → SHIPPED → IN_TRANSIT → DELIVERED
 *   CREATED → REJECTED (terminal)
 *   DELIVERED → RETURN_REQUESTED → RETURNED (terminal)
 */

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]: [OrderStatus.APPROVED, OrderStatus.REJECTED],
  [OrderStatus.APPROVED]: [OrderStatus.PICKING],
  [OrderStatus.REJECTED]: [], // Terminal state
  [OrderStatus.PICKING]: [OrderStatus.PACKED],
  [OrderStatus.PACKED]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]: [OrderStatus.IN_TRANSIT],
  [OrderStatus.IN_TRANSIT]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURN_REQUESTED],
  [OrderStatus.RETURN_REQUESTED]: [OrderStatus.RETURNED],
  [OrderStatus.RETURNED]: [], // Terminal state
};

export class OrderStateMachine {
  /**
   * Check if a transition is valid.
   */
  static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /**
   * Get all valid next states from current state.
   */
  static getValidTransitions(from: OrderStatus): OrderStatus[] {
    return VALID_TRANSITIONS[from] || [];
  }

  /**
   * Validate a transition — throws ApiError if invalid.
   */
  static validateTransition(from: OrderStatus, to: OrderStatus): void {
    if (!this.canTransition(from, to)) {
      const allowed = this.getValidTransitions(from);
      throw ApiError.badRequest(
        `Invalid order transition: ${from} → ${to}. ` +
        `Allowed from ${from}: ${allowed.join(', ') || 'none (terminal state)'}`
      );
    }
  }

  /**
   * Check if a state is terminal (no further transitions possible).
   */
  static isTerminalState(status: OrderStatus): boolean {
    return (VALID_TRANSITIONS[status]?.length ?? 0) === 0;
  }

  /**
   * Get the timestamp field name for a given status.
   */
  static getTimestampField(status: OrderStatus): string | null {
    const fieldMap: Partial<Record<OrderStatus, string>> = {
      [OrderStatus.APPROVED]: 'approvedAt',
      [OrderStatus.PACKED]: 'packedAt',
      [OrderStatus.SHIPPED]: 'shippedAt',
      [OrderStatus.DELIVERED]: 'deliveredAt',
    };
    return fieldMap[status] || null;
  }
}
