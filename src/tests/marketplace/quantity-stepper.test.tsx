import { act, fireEvent, render, screen } from "@testing-library/react";
import QuantityStepper from "@/features/marketplace/components/QuantityStepper";

describe("QuantityStepper", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the current quantity", () => {
    render(<QuantityStepper quantity={10} onCommit={jest.fn()} />);
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("increases instantly and commits once after the debounce", () => {
    const onCommit = jest.fn();
    render(<QuantityStepper quantity={10} onCommit={onCommit} />);

    const plus = screen.getByRole("button", { name: "Increase quantity" });
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);

    expect(screen.getByText("13")).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(13);
  });

  it("never steps below the minimum", () => {
    const onCommit = jest.fn();
    render(<QuantityStepper quantity={10} onCommit={onCommit} />);

    const minus = screen.getByRole("button", { name: "Decrease quantity" });
    expect(minus).toBeDisabled();

    fireEvent.click(minus);
    expect(screen.getByText("10")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("re-syncs to the server quantity and drops the pending burst", () => {
    const onCommit = jest.fn();
    const { rerender } = render(
      <QuantityStepper quantity={10} onCommit={onCommit} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByText("11")).toBeInTheDocument();

    // Server settled (or rolled back) before the local burst was sent.
    rerender(<QuantityStepper quantity={12} onCommit={onCommit} />);
    expect(screen.getByText("12")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("flushes a pending commit when unmounted mid-burst", () => {
    const onCommit = jest.fn();
    const { unmount } = render(
      <QuantityStepper quantity={10} onCommit={onCommit} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    unmount();

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(11);
  });

  it("keeps a newer step while the echo of the previous commit settles", () => {
    const onCommit = jest.fn();
    const { rerender } = render(
      <QuantityStepper quantity={10} onCommit={onCommit} />,
    );

    const plus = screen.getByRole("button", { name: "Increase quantity" });
    fireEvent.click(plus);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onCommit).toHaveBeenCalledWith(11);

    // A newer step lands while the commit for 11 is still in flight.
    fireEvent.click(plus);
    expect(screen.getByText("12")).toBeInTheDocument();

    // The server settles to 11 (the echo of the previous commit): the newer
    // step must survive and still be sent.
    rerender(<QuantityStepper quantity={11} onCommit={onCommit} />);
    expect(screen.getByText("12")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith(12);
  });
});
