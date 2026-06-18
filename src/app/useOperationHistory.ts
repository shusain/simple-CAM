import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { HistoryState, Operation } from '../types';
import { HISTORY_LIMIT } from './defaults';
import type { OperationsUpdater } from './types';
import { operationsChanged } from './helpers';

interface UseOperationHistoryResult {
  operationsHistory: HistoryState<Operation[]>;
  operations: Operation[];
  commitOperations: (nextOrUpdater: OperationsUpdater) => void;
  previewOperations: (nextOrUpdater: OperationsUpdater) => void;
  resetOperations: (nextOperations: Operation[]) => void;
  commitPreviewedOperations: (sourceOperations: Operation[], nextOperations: Operation[]) => void;
  setOperationsHistory: Dispatch<SetStateAction<HistoryState<Operation[]>>>;
}

export function useOperationHistory(initialOperations: Operation[] = []): UseOperationHistoryResult {
  const [operationsHistory, setOperationsHistory] = useState<HistoryState<Operation[]>>({
    past: [],
    present: initialOperations,
    future: [],
  });

  const commitOperations = useCallback((nextOrUpdater: OperationsUpdater) => {
    setOperationsHistory((previous) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(previous.present) : nextOrUpdater;
      if (!Array.isArray(next) || !operationsChanged(previous.present, next)) {
        return previous;
      }

      const past = [...previous.past, previous.present];
      if (past.length > HISTORY_LIMIT) {
        past.shift();
      }

      return {
        past,
        present: next,
        future: [],
      };
    });
  }, []);

  const previewOperations = useCallback((nextOrUpdater: OperationsUpdater) => {
    setOperationsHistory((previous) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(previous.present) : nextOrUpdater;
      if (!Array.isArray(next) || !operationsChanged(previous.present, next)) {
        return previous;
      }

      return {
        ...previous,
        present: next,
      };
    });
  }, []);

  const resetOperations = useCallback((nextOperations: Operation[]) => {
    setOperationsHistory({ past: [], present: nextOperations, future: [] });
  }, []);

  const commitPreviewedOperations = useCallback((sourceOperations: Operation[], nextOperations: Operation[]) => {
    if (!operationsChanged(sourceOperations, nextOperations)) {
      setOperationsHistory((previous) => ({
        ...previous,
        present: sourceOperations,
      }));
      return;
    }

    setOperationsHistory((previous) => {
      const past = [...previous.past, sourceOperations];
      if (past.length > HISTORY_LIMIT) {
        past.shift();
      }

      return {
        past,
        present: nextOperations,
        future: [],
      };
    });
  }, []);

  return {
    operationsHistory,
    operations: operationsHistory.present,
    commitOperations,
    previewOperations,
    resetOperations,
    commitPreviewedOperations,
    setOperationsHistory,
  };
}
